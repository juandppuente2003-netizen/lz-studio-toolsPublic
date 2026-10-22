import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import gaussian_filter
SRC='web/assets/mockups/hoodie.webp'
im=np.array(Image.open(SRC).convert('RGBA')).astype(np.float32); H,W=im.shape[:2]
alpha=im[...,3]>128
def poly_mask(pts,blur=0):
    m=Image.new('L',(W,H),0); ImageDraw.Draw(m).polygon(pts,fill=255)
    a=np.array(m).astype(np.float32)/255
    return a
def fill(region,dx,dy,margin=14,sig=30,feather=8):
    global im
    near=gaussian_filter(region,margin)>0.02
    known=(alpha&~near).astype(np.float32)
    w=gaussian_filter(known,sig)+1e-6
    src=np.roll(np.roll(im,-dy,axis=0),-dx,axis=1)
    out=im.copy()
    m=np.clip(gaussian_filter(region,feather)*1.6,0,1)[...,None]
    for c in range(3):
        low=gaussian_filter(im[...,c]*known,sig)/w
        high=src[...,c]-gaussian_filter(src[...,c],4)
        out[...,c]=im[...,c]*(1-m[...,0])+(low+high)*m[...,0]
    im=out
# 1) Cordones y ojales (tela tomada de la misma altura, a un lado)
fill(poly_mask([(545,190),(615,190),(608,565),(553,565)]),-140,0,margin=8,sig=22)
fill(poly_mask([(645,190),(715,190),(708,565),(653,565)]),140,0,margin=8,sig=22)
# 2) Abertura del gorro
fill(poly_mask([(462,80),(792,80),(812,150),(720,265),(627,320),(534,265),(442,150)]),0,330,sig=40)
# 3) Bolsillo canguro
fill(poly_mask([(330,748),(930,748),(965,1030),(975,1104),(305,1104),(315,1030)]),0,-340,margin=12,sig=70,feather=18)
fill(poly_mask([(400,1088),(870,1088),(870,1117),(400,1117)]),0,-70,margin=6,sig=20,feather=4)
# Costura central del gorro (vista trasera): línea sutil
out=Image.fromarray(np.clip(im,0,255).astype(np.uint8))
d=ImageDraw.Draw(out)
for y in range(70,300):
    x=627
    r,g,b,a=out.getpixel((x,y))
    if a>200: out.putpixel((x,y),(int(r*.86),int(g*.86),int(b*.86),a)); out.putpixel((x+1,y),(int(r*.93),int(g*.93),int(b*.93),a))
out.putalpha(Image.fromarray(im[...,3].astype(np.uint8)))
out.save('hoodie-back.png')
bg=Image.new('RGBA',out.size,(200,200,200,255));bg.alpha_composite(out);bg.resize((627,627)).convert('RGB').save('hoodie-chk.png')
