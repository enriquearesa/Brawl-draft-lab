const fs=require("fs");fs.mkdirSync("out2",{recursive:true});
const UA={"User-Agent":"Mozilla/5.0 (compatible; DraftLab/1.0; +https://github.com/enriquearesa/Brawl-draft-lab)"};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const txt=h=>h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g,"").replace(/<[^>]+>/g,"\n").split("\n").map(s=>s.trim()).filter(Boolean);
(async()=>{
 const base="https://seemeta.com/en/brawl-stars/tier-list";
 const h=await (await fetch(base,{headers:UA})).text();
 const js=[...new Set(h.match(/\/_nuxt\/[A-Za-z0-9_.-]+\.js/g)||[])];
 let found=[];
 for(const j of js.slice(0,60)){const t=await (await fetch("https://seemeta.com"+j,{headers:UA})).text(); const m=t.match(/.{0,120}(?:mythic|Mythic|MYTHIC).{0,200}/g); if(m) found.push(j+"\n"+m.slice(0,6).join("\n---\n"));}
 fs.writeFileSync("out2/js_rank.txt",found.join("\n=====\n"));
 const cands=["?rank=mythic","?rank=MYTHIC","?rank=mythic1","?rank=MYTHIC_I","?rank=mythic-plus","?rank=mythicPlus","?minRank=mythic","?league=mythic","?rank=13","?rank=legendary","?rank=masters"];
 for(const c of cands){const t=txt(await (await fetch(base+c,{headers:UA})).text());const i=t.findIndex(x=>x.startsWith("Ranked battles"));const j=t.indexOf("Mr. P",i);console.log(c,t[i],t.slice(j,j+3).join(" "));await sleep(600);}
 const maps=JSON.parse(fs.readFileSync("tools/maps.json","utf8"));
 for(const [mode,name] of maps){const u=base+"?mode="+mode+"&map="+encodeURIComponent(name);const t=txt(await (await fetch(u,{headers:UA})).text());const i=t.findIndex(x=>x==="Brawl Stars Ranked Tier List");const e=t.findIndex((x,k)=>k>i&&x==="Tier changes");fs.writeFileSync("out2/map_"+name.replace(/[^A-Za-z0-9]/g,"_")+".txt",t.slice(i,e>0?e:i+1400).join("\n"));console.log(name,t[i+2]);await sleep(800);}
})();
