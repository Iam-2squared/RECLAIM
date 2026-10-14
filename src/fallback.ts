/** No-network fallback: keep all navigation usable when WebGL is missing/lost. */
export function makeFallback(host: HTMLElement) {
  let buildings='';
  for(let i=0;i<24;i++){
    const x=i*67-40,h=80+(i*113%250),y=660-h;
    const fill=['#4f5b53','#546056','#657065'][i%3];
    buildings+=`<path d="M${x} 850V${y+25}h18v-25h33v12h17v${850-y-12}z" fill="${fill}"/>`;
    for(let j=0;j<8;j++)for(let k=0;k<3;k++) buildings+=`<rect x="${x+9+k*18}" y="${y+42+j*27}" width="8" height="13" fill="#2d3a31" opacity=".5"/>`;
  }
  const svg=`<svg viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="#7d857d"/><stop offset="1" stop-color="#8c9387"/></linearGradient><linearGradient id="street" x2="0" y2="1"><stop stop-color="#667362"/><stop offset="1" stop-color="#28352b"/></linearGradient></defs><path fill="url(#sky)" d="M0 0h1600v1000H0z"/><g id="fallback-boss" opacity="0" fill="#25322b"><path d="M745 155h92l18 40 77 48 150 117 32 200-40-145-161-95-33 203h-32l-5-235-22-11-34 246h-32l14-225-142 147-69 149 45-187 124-166 15-52z"/></g><g opacity=".7">${buildings}</g><path fill="url(#street)" d="M670 650h270l660 350H0z"/><path fill="#bbc1a7" opacity=".28" d="M800 670h3l-20 50h-5zm-36 90h8l-34 85h-14zm-63 140h17l-38 100h-28z"/><g stroke="#665a4b" stroke-width="6" fill="none"><path d="M554 660l55-395 56 395M584 438h52M572 510h78M581 440l67 69m-11-69l-63 69M609 265l6-62"/></g><g fill="#27382b"><path d="M0 1000V245h53v-32h94v46h49v555l254 186zM1600 1000V199h-105v46h-35V224h-78v603l-248 173z"/></g></svg>`;
  host.innerHTML=svg;
  const boss=host.querySelector('#fallback-boss')!;
  return { bossOpacity(value:number){boss.setAttribute('opacity',String(value));} };
}
