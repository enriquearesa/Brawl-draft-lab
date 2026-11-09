// temporal: descarga páginas de fuentes del meta para analizarlas
const fs=require("fs");fs.mkdirSync("out",{recursive:true});
const UA={"User-Agent":"Mozilla/5.0 (compatible; DraftLab/1.0; +https://github.com/enriquearesa/Brawl-draft-lab)"};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function save(name,url){try{const r=await fetch(url,{headers:UA});const t=await r.text();fs.writeFileSync("out/"+name,t);console.log(r.status,t.length,url);return t}catch(e){console.log("ERR",url,e.message);return ""}}
(async()=>{
 const idx=await save("seemeta_maps.html","https://seemeta.com/en/brawl-stars/maps");
 await save("seemeta_tier.html","https://seemeta.com/en/brawl-stars/tier-list");
 await save("noff_tier.html","https://www.noff.gg/brawl-stars/tier-list");
 await save("bp_pl.html","https://www.brawlplanet.com/powerleague");
 await save("bp_plm1.html","https://www.brawlplanet.com/powerleague/pl-m1");
 await save("bp_gemfort.html","https://www.brawlplanet.com/maps/gemfort_gemgrab");
 const links=[...new Set((idx.match(/\/en\/brawl-stars\/maps\/[a-z0-9-]+\/[a-z0-9-]+/g)||[]))];
 console.log("seemeta map links",links.length);
 for(const l of links){await save("seemeta_"+l.split("/").slice(-2).join("__")+".html","https://seemeta.com"+l);await sleep(800);}
 const ml=await (await fetch("https://api.brawlapi.com/v1/maps",{headers:UA})).json();fs.writeFileSync("out/brawlapi_maps.json",JSON.stringify(ml));
 const bl=await (await fetch("https://api.brawlapi.com/v1/brawlers",{headers:UA})).json();fs.writeFileSync("out/brawlapi_brawlers.json",JSON.stringify(bl));
 for(const n of ["Gem Fort","Hard Rock Mine","Out in the Open","Hideout"]){const m=ml.list.find(x=>x.name===n);if(!m)continue;await save("brawlapi_map_"+m.id+".json","https://api.brawlapi.com/v1/maps/"+m.id);await sleep(400);}
})();
