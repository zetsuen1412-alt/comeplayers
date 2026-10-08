"""Independent original-atlas projection/confidence calculation for audit only."""
import numpy as np
def smooth(a,b,t):
    t=np.clip((t-a)/(b-a),0,1)
    return t*t*(3-2*t)
def profile_xy(p,side,cal):
    c=cal[side];y,z=p[:,1],p[:,2]
    v=c['top_pixel_y']+(c['top_world_y']-y)*c['scale']
    rr=np.asarray(c['main_rear_pixel_rows']);mr=np.asarray(c['model_rear_z_rows'])
    reference_edge=np.interp(v,rr[:,0],rr[:,1]);model_edge=np.interp(y,mr[:,0],mr[:,1])
    factor=abs(reference_edge-c['ear_pixel_x'])/np.maximum(.001,abs(model_edge-c['ear_world_z'])*c['scale'])
    factor=1+cal['depth_factor_blend']*(np.clip(factor,*cal['depth_factor_clamp'])-1)
    u=c['ear_pixel_x']+(-1 if side=='plus' else 1)*(z-c['ear_world_z'])*c['scale']*factor
    return np.column_stack([u,v])
def valid_pixels(rgb,side,cal,include_white=True):
    c=cal[side];y,x=np.indices(rgb.shape[:2]);r=np.asarray(c['reference_hair_envelope'])
    envelope=(y>=r[0,0])&(y<=r[-1,0])&(x>=np.interp(y,r[:,0],r[:,1]))&(x<=np.interp(y,r[:,0],r[:,2]))
    cx,cy,rx,ry=c['reference_headphone_ellipse']
    envelope&=((x-cx)/rx)**2+((y-cy)/ry)**2>1.05**2
    r,g,b=rgb[:,:,0],rgb[:,:,1],rgb[:,:,2];p=cal['hair_palette_gamma_rgb']
    hair=(b-g>p['blue_minus_green_min'])&(b-r>p['blue_minus_red_min'])&(r-g>p['red_minus_green_min'])&(rgb.min(2)>p['minimum_channel_min'])
    if include_white:hair|=rgb.min(2)>cal['near_white_highlight_min_channel']
    return envelope&hair
def weighted_bilinear(linear,mask,xy):
    h,w=mask.shape;u=np.clip(xy[:,0],0,w-1.001);v=np.clip(xy[:,1],0,h-1.001)
    ix=np.floor(u).astype(int);iy=np.floor(v).astype(int);du=u-ix;dv=v-iy
    numerator=np.zeros((len(xy),3));denominator=np.zeros(len(xy))
    for ox,oy in [(0,0),(1,0),(0,1),(1,1)]:
        weight=(du if ox else 1-du)*(dv if oy else 1-dv)*mask[iy+oy,ix+ox]
        denominator+=weight;numerator+=weight[:,None]*linear[iy+oy,ix+ox]
    return numerator,denominator
def filtered(linear,valid,xy,radius,sigma):
    numerator=np.zeros((len(xy),3));denominator=np.zeros(len(xy))
    for dy in range(-radius,radius+1):
        for dx in range(-radius,radius+1):
            k=np.exp(-(dx*dx+dy*dy)/(2*sigma*sigma));n,d=weighted_bilinear(linear,valid,xy+np.array([dx,dy]))
            numerator+=k*n;denominator+=k*d
    return numerator/np.maximum(denominator[:,None],1e-30)
def samples(rgb,side,cal,xy,include_white=True,detail=False):
    gamma=rgb/255.;linear=np.where(gamma<=.04045,gamma/12.92,((gamma+.055)/1.055)**2.4)
    valid=valid_pixels(rgb,side,cal,include_white)
    numerator,direct=weighted_bilinear(linear,valid,xy)
    radius=cal['local_reference_kernel_radius_pixels'];sigma=cal['local_reference_kernel_sigma_pixels']
    total=np.zeros(len(xy));pooled=np.zeros_like(numerator);kernel_total=0.
    for dy in range(-radius,radius+1):
        for dx in range(-radius,radius+1):
            k=np.exp(-(dx*dx+dy*dy)/(2*sigma*sigma));n,d=weighted_bilinear(linear,valid,xy+np.array([dx,dy]))
            total+=k*d;pooled+=k*n;kernel_total+=k
    pooled/=np.maximum(total[:,None],1e-30);numerator/=np.maximum(direct[:,None],1e-30)
    blend=smooth(.20,.85,direct)
    sample=(1-blend[:,None])*pooled+blend[:,None]*numerator
    support=smooth(*cal['local_support_smoothstep'],total/kernel_total)
    if detail:
        c=cal['detail_sampling'];narrow=filtered(linear,valid,xy,c['normalized_reference_filter_radius_pixels'],c['normalized_reference_filter_sigma_pixels']);broad=filtered(linear,valid,xy,c['broad_reference_filter_radius_pixels'],c['broad_reference_filter_sigma_pixels'])
        sample=broad+c['reference_detail_gain']*(narrow-broad)
        maximum=np.asarray(c['maximum_gamma_sample_rgb']);maximum=np.where(maximum<=.04045,maximum/12.92,((maximum+.055)/1.055)**2.4)
        sample=np.maximum(c['minimum_linear_sample_channel'],np.minimum(sample,maximum))
    return sample,support,direct
