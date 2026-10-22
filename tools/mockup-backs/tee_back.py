# Genera vistas de espalda a partir de las fotos de frente: cuello alto (sin escote) y cuello trasero.
import numpy as np, sys, json
from PIL import Image, ImageFilter
SRC='web/assets/mockups/'
def feather(mask,r): return np.array(Image.fromarray((mask*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r))).astype(float)/255
def tee_back(name,cx,cy,ax,by,band,dy,out,rim=10):
    im=np.array(Image.open(SRC+name+'.webp').convert('RGBA')).astype(float)
    H,W=im.shape[:2]; yy,xx=np.mgrid[0:H,0:W]
    alpha=im[...,3]>128
    # Borde superior de la silueta por columna (donde empieza la tela)
    top=np.argmax(alpha,axis=0).astype(float)
    inside=((xx-cx)/ax)**2+((yy-cy)/by)**2<=1
    region=inside&(yy>=top[None,:].repeat(H,0)*0+top[xx])  # dentro del escote y por debajo de la silueta
    # Banda del cuello trasero: desde la silueta hacia abajo 'band' px, solo dentro del ancho del escote
    bandmask=region&(yy<top[xx]+band)
    fill=region&~bandmask
    out_im=im.copy()
    # Relleno de tela: copiar del pecho (misma x, más abajo) y conservar la iluminación local promedio
    src=np.roll(im,-dy,axis=0).copy()
    from scipy.ndimage import gaussian_filter
    def nblur(a,r):return gaussian_filter(a.astype(np.float32),r)
    # Iluminación: interpolada desde la tela que rodea el escote (sin costuras). Textura: detalle fino del pecho.
    near=((xx-cx)/(ax+14))**2+((yy-cy)/(by+14))**2<=1
    known=(alpha&~near).astype(float)
    w=nblur(known,34)+1e-6
    for c in range(3):
        low=nblur(im[...,c]*known,34)/w
        high=src[...,c]-nblur(src[...,c],5)
        src[...,c]=low+high
    m=feather(fill.astype(float),10)[...,None]
    out_im[...,:3]=out_im[...,:3]*(1-m)+src[...,:3]*m
    # Banda: textura de rib tomada del cuello frontal (zona inferior del escote) comprimida verticalmente
    rib_y0=int(cy+by*0.70); rib=im[rib_y0:rib_y0+band*2,:,:3]
    rib=np.array(Image.fromarray(rib.astype(np.uint8)).resize((W,band)))
    # La banda conserva el borde original (es el cuello trasero visto desde el frente) y se aclara su cara interior.
    keep=bandmask&(yy<top[xx]+rim)
    out_im[keep]=im[keep]
    rest=bandmask&~keep
    for x in range(int(cx-ax),int(cx+ax)+1):
        t=int(top[x])+rim
        for k in range(band-rim):
            y=t+k
            if 0<=y<H and rest[y,x]: out_im[y,x,:3]=rib[min(band-1,k*2),x]*0.97
    # Sombra suave bajo el cuello
    sh=np.zeros((H,W)); 
    for x in range(int(cx-ax),int(cx+ax)+1):
        t=int(top[x])+band
        if region[min(t,H-1),x]: sh[t:t+4,x]=1
    sh=feather(sh,3)[...,None]*0.18
    out_im[...,:3]*= (1-sh)
    out_im[...,3]=im[...,3]
    Image.fromarray(out_im.clip(0,255).astype(np.uint8)).save(out)
cfg=json.loads(sys.argv[1])
tee_back(**cfg)
