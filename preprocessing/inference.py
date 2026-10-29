from seg import U2NETP
from GeoTr import GeoTr
from IllTr import IllTr
from inference_ill import rec_ill
from pathlib import Path

import torch
import torch.nn as nn
import torch.nn.functional as F
import skimage.io as io
import numpy as np
import cv2
import glob
import os
from PIL import Image
import argparse
import warnings
warnings.filterwarnings('ignore')


class GeoTr_Seg(nn.Module):
    def __init__(self):
        super(GeoTr_Seg, self).__init__()
        self.msk = U2NETP(3, 1)
        self.GeoTr = GeoTr(num_attn_layers=6)
        
    def forward(self, x):
        msk, _1,_2,_3,_4,_5,_6 = self.msk(x)
        msk = (msk > 0.5).float()
        x = msk * x

        bm = self.GeoTr(x)
        bm = (2 * (bm / 286.8) - 1) * 0.99
        
        return bm
        

def reload_model(model, path=""):
    if not bool(path):
        return model
    else:
        model_dict = model.state_dict()
        pretrained_dict = torch.load(path, map_location=next(model.parameters()).device)
        print(len(pretrained_dict.keys()))
        pretrained_dict = {k[7:]: v for k, v in pretrained_dict.items() if k[7:] in model_dict}
        print(len(pretrained_dict.keys()))
        model_dict.update(pretrained_dict)
        model.load_state_dict(model_dict)

        return model
        

def reload_segmodel(model, path=""):
    if not bool(path):
        return model
    else:
        model_dict = model.state_dict()
        pretrained_dict = torch.load(path, map_location=next(model.parameters()).device)
        print(len(pretrained_dict.keys()))
        pretrained_dict = {k[6:]: v for k, v in pretrained_dict.items() if k[6:] in model_dict}
        print(len(pretrained_dict.keys()))
        model_dict.update(pretrained_dict)
        model.load_state_dict(model_dict)

        return model
        

def rec(opt):
    input_path = Path(opt.input) if opt.input else Path(opt.distorrted_path)
    image_paths = [input_path] if input_path.is_file() else sorted(
        path for path in input_path.iterdir() if path.is_file()
    )
    geo_output = Path(opt.gsave_path)
    illumination_output = Path(opt.isave_path)
    geo_output.mkdir(parents=True, exist_ok=True)
    illumination_output.mkdir(parents=True, exist_ok=True)
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')

    GeoTr_Seg_model = GeoTr_Seg().to(device)
    # reload segmentation model
    reload_segmodel(GeoTr_Seg_model.msk, opt.Seg_path)
    # reload geometric unwarping model
    reload_model(GeoTr_Seg_model.GeoTr, opt.GeoTr_path)
    
    IllTr_model = IllTr().to(device)
    # reload illumination rectification model
    reload_model(IllTr_model, opt.IllTr_path)
    
    # To eval mode
    GeoTr_Seg_model.eval()
    IllTr_model.eval()
  
    for img_path in image_paths:
        name = img_path.stem
        im_ori = np.array(Image.open(img_path))[:, :, :3] / 255.
        h, w, _ = im_ori.shape
        im = cv2.resize(im_ori, (288, 288))
        im = im.transpose(2, 0, 1)
        im = torch.from_numpy(im).float().unsqueeze(0).to(device)
        
        with torch.no_grad():
            # geometric unwarping
            bm = GeoTr_Seg_model(im)
            bm = bm.cpu()
            bm0 = cv2.resize(bm[0, 0].numpy(), (w, h))  # x flow
            bm1 = cv2.resize(bm[0, 1].numpy(), (w, h))  # y flow
            bm0 = cv2.blur(bm0, (3, 3))
            bm1 = cv2.blur(bm1, (3, 3))
            lbl = torch.from_numpy(np.stack([bm0, bm1], axis=2)).unsqueeze(0)  # h * w * 2
            
            out = F.grid_sample(
                torch.from_numpy(im_ori).permute(2, 0, 1).unsqueeze(0).float(),
                lbl,
                align_corners=True,
            )
            img_geo = ((out[0]*255).permute(1, 2, 0).numpy())[:,:,::-1].astype(np.uint8)
            cv2.imwrite(str(geo_output / f'{name}_geo.png'), img_geo)
            
            # illumination rectification
            if opt.ill_rec:
                ill_savep = str(illumination_output / f'{name}_ill.png')
                rec_ill(IllTr_model, img_geo, saveRecPath=ill_savep)
        
        print('Done: ', img_path)


def main():
    parser = argparse.ArgumentParser() 
    parser.add_argument('--distorrted_path', default='./distorted/')
    parser.add_argument('--input', default=None, help='Process a single input image')
    parser.add_argument('--gsave_path', default='./geo_rec/')
    parser.add_argument('--isave_path', default='./ill_rec/')
    parser.add_argument('--Seg_path', default='./model_pretrained/seg.pth')
    parser.add_argument('--GeoTr_path', default='./model_pretrained/geotr.pth')
    parser.add_argument('--IllTr_path', default='./model_pretrained/illtr.pth')
    parser.add_argument('--ill_rec', action='store_true')
    
    opt = parser.parse_args()

    rec(opt)


if __name__ == '__main__':
    main()
