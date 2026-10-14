export const MOTIF = [1,3,2];
export const BOSS = {x:0,y:-.7};
export const RESONATOR = {x:.65,y:.2};
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export class Game {
 constructor(){this.reset();}
 reset(){this.time=0;this.mode='explore';this.player={x:0,y:.7,hp:5,res:40,inv:0,dodge:0,parry:0,attack:0,dx:0,dy:-1};this.boss={hp:300,max:300,phase:1};this.bullets=[];this.rings=[];this.effects=[];this.events=[];this.notes=[];this.nextPattern=0;this.pending=null;this.beam=null;this.hits=0;this.reflected=0;this.ending=null;}
 emit(type,data={}){this.events.push({type,...data});}
 get near(){return distance(this.player,RESONATOR)<.3;}
 interact(){if(this.mode==='explore'&&this.near){this.mode='puzzle';this.notes=[];this.emit('puzzle');}}
 note(n){if(this.mode!=='puzzle')return false;this.notes.push(n);if(n!==MOTIF[this.notes.length-1]){this.notes=[];this.emit('wrong-note');return false;}if(this.notes.length===3){this.mode='battle';this.nextPattern=this.time+2.5;this.player.hp=5;this.player.res=60;this.emit('battle');}return true;}
 attack(){const p=this.player;if(this.mode!=='battle'||p.attack>0)return;p.attack=.45;this.emit('attack');if(distance(p,BOSS)<.42){this.damageBoss(8);p.res=clamp(p.res+4,0,100);this.effects.push({kind:'strike',x:BOSS.x,y:BOSS.y,life:.25});}else this.emit('out-of-range');}
 dodge(){const p=this.player;if(!['battle','explore'].includes(this.mode)||p.dodge>0)return;p.dodge=.72;p.inv=Math.max(p.inv,.26);this.emit('dodge');}
 parry(){const p=this.player;if(this.mode!=='battle'||p.parry>0)return;p.parry=.65;p.parryWindow=.2;this.emit('parry');}
 pulse(){const p=this.player;if(this.mode!=='battle'||p.res<40)return false;p.res-=40;this.bullets=[];this.rings=[];this.beam=null;this.damageBoss(32);this.effects.push({kind:'pulse',x:p.x,y:p.y,life:.65});this.emit('pulse');return true;}
 damageBoss(n){if(this.mode!=='battle')return;this.boss.hp=Math.max(0,this.boss.hp-n);const phase=this.boss.hp>210?1:this.boss.hp>105?2:3;if(this.boss.hp===0){this.mode='choice';this.bullets=[];this.rings=[];this.pending=null;this.beam=null;this.emit('victory');}else if(phase!==this.boss.phase){this.boss.phase=phase;this.bullets=[];this.rings=[];this.pending=null;this.beam=null;this.nextPattern=this.time+2;this.emit('phase',{phase});}}
 choose(choice){if(this.mode!=='choice'||!['keep','silence'].includes(choice))return;this.ending=choice;this.mode='ended';this.emit('ending',{choice});}
 hurt(){const p=this.player;if(p.inv>0||this.mode!=='battle')return;p.hp--;p.inv=1.15;this.hits++;this.emit('hurt');if(p.hp<=0){this.mode='dead';this.emit('dead');}}
 spawn(pattern,angle){const phase=this.boss.phase;if(pattern==='ring'){this.rings.push({r:.08,speed:.48,hit:false});}else if(pattern==='beam'){this.beam={angle,life:.35,hit:false};}else{const total=phase===3?15:11;for(let i=0;i<total;i++){const direction=(i/(total-1))*Math.PI;this.bullets.push({x:BOSS.x,y:BOSS.y,vx:Math.cos(direction)*.34,vy:Math.sin(direction)*.34,r:.024,reflectable:i%3===0});}}this.emit('pattern',{pattern});}
 step(dt,input={x:0,y:0}){
  dt=clamp(dt,0,.05);if(!['explore','battle'].includes(this.mode))return;
  this.time+=dt;const p=this.player;for(const k of ['inv','dodge','parry','parryWindow','attack'])p[k]=Math.max(0,(p[k]||0)-dt);
  const length=Math.hypot(input.x||0,input.y||0);if(length>.05){const x=input.x/Math.max(1,length),y=input.y/Math.max(1,length);p.dx=x;p.dy=y;const speed=p.dodge>.46?2.1:.65;p.x+=x*speed*dt;p.y+=y*speed*dt;}
  const boundary=Math.hypot(p.x,p.y);if(boundary>.94){p.x*=.94/boundary;p.y*=.94/boundary;}
  this.effects=this.effects.filter(e=>(e.life-=dt)>0);
  if(this.mode!=='battle')return;
  if(this.pending&&this.time>=this.pending.at){this.spawn(this.pending.pattern,this.pending.angle);this.pending=null;}
  if(!this.pending&&this.time>=this.nextPattern){const cycle=Math.floor(this.time/3.2);const pattern=this.boss.phase===1?'fan':this.boss.phase===2?(cycle%2?'ring':'beam'):['ring','fan','beam'][cycle%3];this.pending={pattern,at:this.time+1.1,angle:Math.atan2(p.y-BOSS.y,p.x-BOSS.x)};this.nextPattern=this.time+3.2;this.emit('telegraph',{pattern});}
  for(const b of this.bullets){b.x+=b.vx*dt;b.y+=b.vy*dt;if(distance(p,b)<.075){if(b.reflectable&&p.parryWindow>0){b.dead=true;p.res=clamp(p.res+14,0,100);this.reflected++;this.damageBoss(12);this.emit('reflected');}else if(p.inv<=0){b.dead=true;this.hurt();}}}
  this.bullets=this.bullets.filter(b=>!b.dead&&Math.hypot(b.x,b.y)<1.4);
  for(const r of this.rings){r.r+=r.speed*dt;if(!r.hit&&Math.abs(distance(p,BOSS)-r.r)<.05){r.hit=true;this.hurt();}}
  this.rings=this.rings.filter(r=>r.r<2.1);
  if(this.beam){this.beam.life-=dt;const dx=p.x-BOSS.x,dy=p.y-BOSS.y,a=this.beam.angle;const across=Math.abs(dx*Math.sin(a)-dy*Math.cos(a));const along=dx*Math.cos(a)+dy*Math.sin(a);if(!this.beam.hit&&across<.07&&along>0){this.beam.hit=true;this.hurt();}if(this.beam.life<=0)this.beam=null;}
 }
}
