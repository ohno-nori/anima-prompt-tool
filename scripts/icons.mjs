// Dependency-free PNG rasterization of the local vector mark. Supersampled for smooth edges.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
const crc = (buffer) => { let c = 0xffffffff; for (const b of buffer) { c ^= b; for (let i=0;i<8;i++) c = (c>>>1)^((c&1)?0xedb88320:0); } return (c^0xffffffff)>>>0; };
const chunk = (type, data) => { const t=Buffer.from(type), b=Buffer.alloc(data.length+12); b.writeUInt32BE(data.length); t.copy(b,4); data.copy(b,8); b.writeUInt32BE(crc(Buffer.concat([t,data])),data.length+8); return b; };
function render(size) {
  const raw=Buffer.alloc(size*(size*4+1));
  for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
    const colors=[0,0,0];
    for(let sy=0;sy<4;sy++) for(let sx=0;sx<4;sx++) {
      const u=(x+(sx+.5)/4)/size*512, v=(y+(sy+.5)/4)/size*512;
      let color=[102,118,83];
      const outer=v>=132 && v<=365 && Math.abs(u-256)<(v-115)*.47;
      const inner=v>228 && Math.abs(u-256)<(v-228)*.43;
      if(outer&&!inner) color=[247,248,243];
      const a=(u-282)*.79-(v-265)*.61, b=(u-282)*.61+(v-265)*.79;
      if(a*a/(91*91)+b*b/(26*26)<1) color=[207,223,168];
      color.forEach((c,i)=>colors[i]+=c/16);
    }
    const offset=y*(size*4+1)+1+x*4; colors.forEach((c,i)=>raw[offset+i]=Math.round(c)); raw[offset+3]=255;
  }
  const header=Buffer.alloc(13); header.writeUInt32BE(size); header.writeUInt32BE(size,4); header[8]=8; header[9]=6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
mkdirSync('public',{recursive:true});
for(const [name,size] of [['icon-192.png',192],['icon-512.png',512],['icon-maskable-512.png',512],['apple-touch-icon.png',180]]) writeFileSync(`public/${name}`,render(size));
