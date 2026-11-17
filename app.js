'use strict';
const $=id=>document.getElementById(id);
let mode='detailed',start=null,map=null,earthMap=null,routeLayer=null,markers=[],pickStart=false,routeRequest=0;
let trip=null,watchId=null,arrivalSpeech='';
const say=s=>{$('message').textContent=s};
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const miles=m=>(m/1609.344).toFixed(1)+' mi';
const time=s=>{const min=Math.round(s/60);return min>=60?`${Math.floor(min/60)}h ${min%60}m`:`${min} min`};
function initMap(){if(map)return;map=L.map('map').setView([39,0],2);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors',maxZoom:19}).addTo(map);map.on('click',e=>{if(!pickStart)return;start={lat:e.latlng.lat,lon:e.latlng.lng};pickStart=false;$('pickStart').textContent='🗺️ Pick starting point on map';$('originText').textContent='Starting point selected on map.';setMarkers();say('STARTING POINT SET. NOW WHERE THE FUCK ARE WE GOING?')})}
function setMarkers(dest){markers.forEach(m=>map.removeLayer(m));markers=[];if(start)markers.push(L.marker([start.lat,start.lon]).addTo(map).bindPopup('Starting point'));if(dest)markers.push(L.marker([dest.lat,dest.lon]).addTo(map).bindPopup(safe(dest.name||'Destination')))}
function locate(cb){if(!navigator.geolocation){say('THIS BROWSER DOESN’T SUPPORT LOCATION. PICK A POINT ON THE MAP.');return}navigator.geolocation.getCurrentPosition(p=>cb({lat:p.coords.latitude,lon:p.coords.longitude}),e=>say('LOCATION UNAVAILABLE: '+e.message+'. YOU CAN PICK A POINT ON THE MAP INSTEAD.'),{enableHighAccuracy:true,timeout:12000})}
$('locate').onclick=()=>locate(p=>{start=p;initMap();setMarkers();map.setView([p.lat,p.lon],14);$('originText').textContent='Starting point: your permitted location.';say('FOUND YOUR ASS. NOW ENTER A DESTINATION.')});
$('pickStart').onclick=()=>{pickStart=!pickStart;$('pickStart').textContent=pickStart?'❌ Cancel map selection':'🗺️ Pick starting point on map';say(pickStart?'TAP THE MAP WHERE YOU WANT TO START.':'MAP SELECTION CANCELED.')};
async function geocode(q){const url='https://nominatim.openstreetmap.org/search?format=json&limit=1&q='+encodeURIComponent(q);const r=await fetch(url,{headers:{'Accept':'application/json'}});if(!r.ok)throw Error('Location search unavailable right now');const a=await r.json();if(!a.length)throw Error('Couldn’t find that destination. Try a more specific address.');return {lat:+a[0].lat,lon:+a[0].lon,name:a[0].display_name}}
async function getRoute(a,b){const u=`https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=full&geometries=geojson&steps=true&alternatives=true`;const r=await fetch(u);if(!r.ok)throw Error('Routing service is busy. Try again shortly.');const j=await r.json();if(j.code!=='Ok'||!j.routes?.length)throw Error('No drivable route found between those points.');return j.routes}
function stepName(st){let m=st.maneuver||{},type=m.type||'',mod=m.modifier||'',road=st.name?` onto ${st.name}`:'';if(type==='arrive')return 'YOU MADE IT. SOMEHOW.';if(type==='depart')return 'Start driving'+road;if(type==='roundabout'||type==='rotary')return 'Take the roundabout'+(m.exit?` and exit ${m.exit}`:'')+road;if(type==='uturn'||mod==='uturn')return 'MAKE A FUCKIN U-TURN'+road;if(type==='merge')return 'Merge '+mod+road;if(type==='on ramp'||type==='off ramp')return type==='on ramp'?'Take the ramp'+road:'Take the exit'+road;if(mod.includes('left'))return 'TURN FUCKIN LEFT'+road;if(mod.includes('right'))return 'TURN FUCKIN RIGHT'+road;if(mod==='straight'||type==='continue'||type==='new name')return 'KEEP GOING STRAIGHT'+road;return (type||'Continue').replace(/\b\w/g,x=>x.toUpperCase())+road}
function counts(steps){let c={left:0,right:0,straight:0,uturn:0,other:0};for(const s of steps){const m=s.maneuver||{};if(m.type==='depart'||m.type==='arrive')continue;const mod=m.modifier||'';if(mod==='uturn')c.uturn++;else if(mod.includes('left'))c.left++;else if(mod.includes('right'))c.right++;else if(mod==='straight'||m.type==='continue'||m.type==='new name')c.straight++;else c.other++}return c}
function renderRoute(route,shortest,waypoint){
  stopTracking();trip={destination:waypoint,normalSeconds:shortest.duration,detourSeconds:route.duration,mode};
  $('arrivalCard').hidden=true;$('arrivalControls').hidden=mode!=='gps';if(routeLayer)map.removeLayer(routeLayer);const points=route.geometry.coordinates.map(c=>[c[1],c[0]]);routeLayer=L.polyline(points,{color:'#ff7947',weight:6,opacity:.92}).addTo(map);map.fitBounds(routeLayer.getBounds(),{padding:[35,35]});$('results').hidden=false;const steps=route.legs.flatMap(l=>l.steps);$('distance').textContent=miles(route.distance);$('duration').textContent=time(route.duration);$('routeTitle').textContent=mode==='gps'?'THE RIDICULOUS FUCKIN DETOUR':'YOUR FUCKIN ROUTE';$('extraLabel').textContent=mode==='gps'?'Extra time':'Route steps';$('extra').textContent=mode==='gps'?'+'+time(Math.max(0,route.duration-shortest.duration)):String(steps.length);const c=counts(steps);$('turnCounts').innerHTML=`<span>⬅️ ${c.left} left</span><span>➡️ ${c.right} right</span><span>⬆️ ${c.straight} straight</span><span>↩️ ${c.uturn} U-turns</span><span>🔀 ${c.other} other</span>`;$('directions').innerHTML=steps.map((s,i)=>`<div class="step"><div class="num">${i+1}</div><div>${safe(stepName(s))}<small>${miles(s.distance)}</small></div></div>`).join('');say(mode==='gps'?`CONGRATULATIONS, YOU'RE TAKING THE LONG WAY. ${time(Math.max(0,route.duration-shortest.duration))} EXTRA. WHY? BECAUSE FUCK YOU, THAT'S WHY.`:'HERE’S EVERY FUCKIN TURN. YOU’RE WELCOME.');}
async function getDetour(a,b,shortest){
  // Aim for a real route around 4.5x the normal ETA (10 min -> about 45 min).
  // Never fabricate a route or ETA; public routing may not support the target.
  const target=shortest.duration*4.5;
  const midLat=(a.lat+b.lat)/2,midLon=(a.lon+b.lon)/2;
  const latRad=midLat*Math.PI/180,cos=Math.max(.25,Math.cos(latRad));
  const dx=(b.lon-a.lon)*cos,dy=b.lat-a.lat;
  const length=Math.max(.008,Math.hypot(dx,dy));
  const px=-dy/length,py=dx/length;
  let best=null,score=Infinity;
  // Several candidate waypoints on either side, progressively farther away.
  for(const factor of [1.5,-1.5,3,-3,5,-5,8,-8]){
    const offset=Math.min(.5,Math.max(.012,length*.55))*factor;
    const via={lat:Math.max(-80,Math.min(80,midLat+py*offset)),lon:Math.max(-179,Math.min(179,midLon+px*offset/cos))};
    try{
      const url=`https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${via.lon},${via.lat};${b.lon},${b.lat}?overview=full&geometries=geojson&steps=true`;
      const res=await fetch(url);if(!res.ok)continue;
      const j=await res.json(),r=j.routes?.[0];
      if(j.code!=='Ok'||!r||r.duration<=shortest.duration*1.2)continue;
      const diff=Math.abs(r.duration-target);
      if(diff<score){best=r;score=diff}
      if(diff<target*.12)break;
    }catch(e){/* Try another candidate */}
  }
  return best;
}
$('go').onclick=async()=>{const q=$('destination').value.trim();if(!start){say('FIRST TELL ME WHERE THE FUCK YOU ARE. USE LOCATION OR PICK THE MAP.');return}if(!q){say('ENTER A FUCKIN DESTINATION FIRST.');return}const id=++routeRequest;$('go').disabled=true;say('CALCULATING YOUR QUESTIONABLE LIFE CHOICES…');try{const dest=await geocode(q);if(id!==routeRequest)return;const routes=await getRoute(start,dest);if(id!==routeRequest)return;const shortest=routes.reduce((a,b)=>a.distance<b.distance?a:b);let chosen=shortest;if(mode==='gps'){chosen=await getDetour(start,dest,shortest)||routes.reduce((a,b)=>a.distance>b.distance?a:b);if(chosen===shortest)say('NO DETOUR AVAILABLE HERE. EVEN THIS GPS HAS LIMITS.')}if(id!==routeRequest)return;setMarkers(dest);renderRoute(chosen,shortest,dest)}catch(e){if(id===routeRequest)say('OH FUCK: '+e.message)}finally{if(id===routeRequest)$('go').disabled=false}};
$('destination').addEventListener('keydown',e=>{if(e.key==='Enter')$('go').click()});
document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{stopTracking();$('arrivalControls').hidden=true;mode=b.dataset.mode;routeRequest++;$('go').disabled=false;document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x===b));$('routePanel').hidden=mode==='space';$('spacePanel').hidden=mode!=='space';if(mode!=='space'){initMap();setTimeout(()=>map.invalidateSize(),50);say(mode==='gps'?'THE LONG WAY. BECAUSE GETTING THERE QUICKLY IS OVERRATED.':'COUNTING EVERY FUCKIN TURN. ENTER A DESTINATION.')}});
function revealEarth(){document.querySelector('.earth').classList.add('selected');$('earthReveal').hidden=false;$('spaceMessage').textContent='WHERE THE FUCK YOU THINK YOU WERE? YOU’RE ON EARTH. 🌎';$('earthReveal').scrollIntoView({behavior:'smooth',block:'nearest'});if(!earthMap){earthMap=L.map('earthMap').setView([20,0],2);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors'}).addTo(earthMap)}setTimeout(()=>earthMap.invalidateSize(),150)}
let planetTimer=null;document.querySelectorAll('.planet').forEach(b=>b.onclick=()=>{clearTimeout(planetTimer);const p=b.dataset.planet;if(p==='Earth'){revealEarth();return}$('spaceMessage').textContent=`${p.toUpperCase()}?! WHY THE FUCK YOU THINK YOU'RE THERE? LET ME HELP YOU. 🚀`;planetTimer=setTimeout(revealEarth,1800)});
$('earthButton').onclick=revealEarth;$('earthLocate').onclick=()=>locate(p=>{revealEarth();earthMap.setView([p.lat,p.lon],13);L.marker([p.lat,p.lon]).addTo(earthMap).bindPopup('YOU ARE HERE, ON FUCKIN EARTH.').openPopup();$('earthCoords').textContent=`YOU'RE HERE: ${p.lat.toFixed(4)}°, ${p.lon.toFixed(4)}° — ON EARTH, GENIUS.`});
initMap();

// The joke uses the normal route's ETA versus the detour's ETA, not a hard-coded 35 minutes.
function arrivalMinutes(){return Math.max(0,Math.round((trip.detourSeconds-trip.normalSeconds)/60))}
function stopTracking(){if(watchId!==null&&navigator.geolocation){navigator.geolocation.clearWatch(watchId)}watchId=null;$('startTrip').hidden=false;$('stopTrip').hidden=true}
function arrived(){if(!trip||trip.mode!=='gps')return;stopTracking();const wasted=arrivalMinutes();arrivalSpeech=wasted>0?`YOU KNOW YOU COULD'VE BEEN HERE ${wasted} FUCKIN MINUTES AGO, RIGHT?!`:'YOU FINALLY FUCKIN MADE IT! EVEN THIS GPS COULDN’T FIND A LONGER ROUTE.';$('arrivalRoast').textContent=arrivalSpeech;$('arrivalStats').textContent=`Normal route: ${time(trip.normalSeconds)} • Your detour: ${time(trip.detourSeconds)} • Estimated extra time: ${wasted} min`;$('arrivalCard').hidden=false;$('arrivalCard').scrollIntoView({behavior:'smooth',block:'center'});say('DESTINATION REACHED. CONGRATULATIONS, GENIUS.')}
$('startTrip').onclick=()=>{if(!trip||trip.mode!=='gps'||!trip.destination){say('CALCULATE A LONG-WAY ROUTE FIRST.');return}if(!navigator.geolocation){say('YOUR BROWSER DOESN’T SUPPORT GPS TRACKING.');return}if(watchId!==null)return;$('trackingStatus').textContent='Waiting for GPS permission and location…';watchId=navigator.geolocation.watchPosition(pos=>{if(!trip||trip.mode!=='gps')return;const a=pos.coords,b=trip.destination;const r=Math.PI/180,dl=(b.lat-a.latitude)*r,dn=(b.lon-a.longitude)*r;const h=Math.sin(dl/2)**2+Math.cos(a.latitude*r)*Math.cos(b.lat*r)*Math.sin(dn/2)**2;const distance=6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));$('trackingStatus').textContent=`Tracking active • Approximately ${Math.round(distance)} meters from destination`;if(distance<=Math.max(75,Math.min(125,a.accuracy||75)))arrived()},err=>{stopTracking();$('trackingStatus').textContent='GPS unavailable: '+err.message+'. Try again with location enabled.'},{enableHighAccuracy:true,maximumAge:3000,timeout:20000});$('startTrip').hidden=true;$('stopTrip').hidden=false};
$('stopTrip').onclick=()=>{stopTracking();$('trackingStatus').textContent='Tracking stopped.'};
$('speakArrival').onclick=()=>{if(!('speechSynthesis'in window)){say('VOICE PLAYBACK ISN’T SUPPORTED IN THIS BROWSER.');return}speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(arrivalSpeech);u.rate=.95;speechSynthesis.speak(u)};
