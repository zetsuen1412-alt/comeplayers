from pathlib import Path
HERE=Path(__file__).resolve().parent
source=(HERE/'build_polished_hair_v2.py').read_text(encoding='utf-8')
source=source.replace("x=np.array([.108,.126,.143,.151,.159,.166])", "x=np.array([.095,.111,.124,.134,.147,.158]) if side>0 else np.array([.098,.116,.137,.155,.173,.184])")
source=source.replace("z=np.array([.111,.134,.154,.158,.136,.108])", "z=np.array([.101,.128,.143,.145,.139,.109]) if side>0 else np.array([.101,.123,.133,.134,.125,.096])")
source=source.replace("'points':np.column_stack((-.006+side*x,y,z)), 'width':.027", "'points':np.column_stack((-.006+side*x,y,z)), 'width':.022")
source=source.replace("'taper_start':.54, 'temple_fringe':True", "'taper_start':.86, 'temple_fringe':True")
source=source.replace("local_spec.update(half_depth=.009,color_gamma=[.865,.802,.953])", "local_spec.update(half_depth=.006,color_gamma=[.865,.802,.953])")
source=source.replace('crwt.alexia.high_polish_hair.v2_integrated_lower_and_temples','crwt.alexia.high_polish_hair.v3_conforming_temple_clumps')
source=source.replace("'temple_fringe_occludes_source_black_hair_only_by_actual_review':True", "'temple_fringe_actual_occlusion_review_required':True")
out=HERE/'build_polished_hair_v3.py'
assert not out.exists()
compile(source,str(out),'exec');out.write_bytes(source.encode('utf-8'));print(out)
