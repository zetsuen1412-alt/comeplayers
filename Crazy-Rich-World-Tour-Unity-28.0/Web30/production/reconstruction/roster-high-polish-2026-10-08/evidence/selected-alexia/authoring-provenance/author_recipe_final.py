from pathlib import Path
HERE=Path(__file__).resolve().parent
source=(HERE/'build_polished_hair_v4.py').read_text(encoding='utf-8')
a=source.index('def polished_guides(spec):');b=source.index('def tangent_space(',a)
part=source[a:b].replace(' return result', " return [g for g in result if not g.get('temple_fringe')]")
source=source[:a]+part+source[b:]
source=source.replace('crwt.alexia.high_polish_hair.v4_root_integrated_temple_clumps','crwt.alexia.high_polish_hair.v5_coherent_rounded_waves')
source=source.replace('authored cap, sixteen rounded waves and two tapered temple fringes','authored cap and sixteen rounded waves with coherent center ends')
source=source.replace('Alexia polished rounded lavender waves and temple fringes Oct8','Alexia polished coherent rounded lavender waves Oct8')
source=source.replace("'temple_fringe_components':2,'temple_fringe_actual_occlusion_review_required':True", "'temple_fringe_components':0,'projected_source_temple_dark_patches_retained':True")
out=HERE/'build_polished_hair_final.py'
assert not out.exists();compile(source,str(out),'exec');out.write_bytes(source.encode('utf-8'));print(out)
