from pathlib import Path
HERE=Path(__file__).resolve().parent
source=(HERE/'build_polished_hair_v3.py').read_text(encoding='utf-8')
source=source.replace("x=np.array([.095,.111,.124,.134,.147,.158]) if side>0 else np.array([.098,.116,.137,.155,.173,.184])", "x=np.array([.062,.082,.107,.132,.149,.159]) if side>0 else np.array([.065,.090,.119,.149,.171,.183])")
source=source.replace("z=np.array([.101,.128,.143,.145,.139,.109]) if side>0 else np.array([.101,.123,.133,.134,.125,.096])", "z=np.array([.150,.170,.171,.169,.159,.130])")
source=source.replace('crwt.alexia.high_polish_hair.v3_conforming_temple_clumps','crwt.alexia.high_polish_hair.v4_root_integrated_temple_clumps')
out=HERE/'build_polished_hair_v4.py'
assert not out.exists();compile(source,str(out),'exec');out.write_bytes(source.encode('utf-8'));print(out)
