const SPREADSHEET_ID = '15KswxkGVrBV4ApyCQEzo6DzjKW6uR0B5fVEipBA9zpg';
const enc = new TextEncoder();
const b64url = input => btoa(typeof input === 'string' ? input : String.fromCharCode(...new Uint8Array(input))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
const colLetter = n => { let s=''; while(n){s=String.fromCharCode(64+(n-1)%26)+s;n=Math.floor((n-1)/26)} return s };
function cors(request, env){const origin=request.headers.get('Origin')||'';return {'Access-Control-Allow-Origin':env.ALLOWED_ORIGIN===origin?origin:env.ALLOWED_ORIGIN||'*','Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Vary':'Origin'}}
function json(value,request,env,status=200){return new Response(JSON.stringify(value),{status,headers:{...cors(request,env),'Content-Type':'application/json;charset=utf-8'}})}
async function googleToken(env){const a=JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON);const now=Math.floor(Date.now()/1000), header=b64url(JSON.stringify({alg:'RS256',typ:'JWT'})), claims=b64url(JSON.stringify({iss:a.client_email,scope:'https://www.googleapis.com/auth/spreadsheets',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3500}));const key=await crypto.subtle.importKey('pkcs8',Uint8Array.from(atob(a.private_key.replace(/-----(BEGIN|END) PRIVATE KEY-----|\s/g,'')),x=>x.charCodeAt(0)),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);const sig=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,enc.encode(header+'.'+claims));const body=new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:header+'.'+claims+'.'+b64url(sig)});const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});if(!r.ok)throw new Error('Google authentication failed');return (await r.json()).access_token}
async function sheets(env,path,init={}){const token=await googleToken(env);const r=await fetch('https://sheets.googleapis.com/v4/spreadsheets/'+SPREADSHEET_ID+path,{...init,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',...(init.headers||{})}});if(!r.ok)throw new Error(`Google Sheets error (${r.status})`);return r.status===204?null:r.json()}
const SEAT_COUNTS=[2,2,3,3,4,4,4,4,5,5,6,7,7,7,7,7,7,7], MAX_SEATS=10;
const normal=s=>String(s).trim().normalize('NFC').toLocaleLowerCase('vi-VN');
// Nam: vị trí 1 = B (cột 2), vị trí 2 = C. Nữ: vị trí 1 = J (cột 10), vị trí 2 = I.
const seatCol = (side, position) =>
  side === 'male'
    ? position + 1
    : 11 - position;
const parseStudent=value=>{const split=String(value||'').lastIndexOf(' - ');return split<0?{value:String(value||''),name:String(value||''),className:''}:{value:String(value),name:String(value).slice(0,split),className:String(value).slice(split+3)}};
function makeSide(sheet,side){const rows=sheet.data?.[0]?.rowData||[];return SEAT_COUNTS.map((base,index)=>{const row=index+1, values=rows[index]?.values||[];let count=base;for(let position=base+1;position<=MAX_SEATS;position++){const cell=values[seatCol(side,position)-1];if(cell?.userEnteredValue)count=position}return {table:String(row),seats:Array.from({length:count},(_,i)=>{const position=i+1,col=seatCol(side,position),value=values[col-1]?.formattedValue||'';return {side,row,col,table:String(row),position,...parseStudent(value)}})}})}
async function plan(env){const fields='sheets(properties(title),data(rowData(values(formattedValue,userEnteredValue))))';const raw=await sheets(env,`?includeGridData=true&fields=${encodeURIComponent(fields)}`);const find=n=>{const sheet=raw.sheets.find(s=>normal(s.properties.title)===normal(n));if(!sheet)throw new Error(`Không tìm thấy tab "${n}". Các tab hiện có: ${raw.sheets.map(s=>s.properties.title).join(', ')}`);return sheet};const ds=await sheets(env,'/values/DS!A2:B');return {female:makeSide(find('Nữ'),'female'),male:makeSide(find('Nam'),'male'),students:(ds.values||[]).filter(x=>x[1]).map(x=>({className:x[0]||'',name:x[1]}))}}
function sheetOf(side){return side==='female'?'Nữ':'Nam'}
async function updateSeat(env,b){
  if(
    !['male','female'].includes(b.side) ||
    !Number.isInteger(b.row) ||
    !Number.isInteger(b.position) ||
    b.row < 1 ||
    b.row > SEAT_COUNTS.length ||
    b.position < 1 ||
    b.position > MAX_SEATS
  ) throw new Error('Vị trí không hợp lệ');

  const col = seatCol(b.side, b.position);

  const cell = `${sheetOf(b.side)}!${colLetter(col)}${b.row}`;

  const value = b.name
    ? `${b.name} - ${b.className || ''}`.trim().replace(/ -$/,'')
    : '';

  console.log(JSON.stringify({ event:'seat-write', side:b.side, row:b.row, position:b.position, cell, action:value?'save':'clear' }));

  if(!value){
    await sheets(env,`/values/${encodeURIComponent(cell)}:clear`,{
      method:'POST',
      body:'{}'
    });

    const id = await sheetId(env,sheetOf(b.side));

    await sheets(env,':batchUpdate',{
      method:'POST',
      body:JSON.stringify({
        requests:[{
          updateCells:{
            range:{
              sheetId:id,
              startRowIndex:b.row-1,
              endRowIndex:b.row,
              startColumnIndex:col-1,
              endColumnIndex:col
            },
            rows:[{values:[{note:''}]}],
            fields:'note'
          }
        }]
      })
    });

    return cell;
  }

  await sheets(
    env,
    `/values/${encodeURIComponent(cell)}?valueInputOption=RAW`,
    {
      method:'PUT',
      body:JSON.stringify({
        values:[[value]]
      })
    }
  );
  return cell;
}
async function sheetId(env,title){const r=await sheets(env,'?fields=sheets(properties(sheetId,title))');const s=r.sheets.find(x=>x.properties.title===title);if(!s)throw new Error('Không tìm thấy sheet '+title);return s.properties.sheetId}
async function addSeat(env,b){const table=Number(b.table);if(!['male','female'].includes(b.side)||!Number.isInteger(table)||table<7||table>SEAT_COUNTS.length)throw new Error('Chỉ có thể thêm chỗ từ bàn 7 đến 18');const p=await plan(env),t=p[b.side].find(x=>Number(x.table)===table);if(!t||t.seats.length>=MAX_SEATS)throw new Error(`Bàn này đã đủ tối đa ${MAX_SEATS} vị trí`);const position=t.seats.length+1,col=seatCol(b.side,position),id=await sheetId(env,sheetOf(b.side));await sheets(env,':batchUpdate',{method:'POST',body:JSON.stringify({requests:[{updateCells:{range:{sheetId:id,startRowIndex:table-1,endRowIndex:table,startColumnIndex:col-1,endColumnIndex:col},rows:[{values:[{userEnteredValue:{stringValue:''}}]}],fields:'userEnteredValue'}}]})})}
export class SeatRoom {constructor(ctx){this.ctx=ctx}async fetch(request){if(request.headers.get('Upgrade')!=='websocket')return new Response('WebSocket required',{status:426});const [client,server]=Object.values(new WebSocketPair());this.ctx.acceptWebSocket(server);return new Response(null,{status:101,webSocket:client})}webSocketMessage(ws,message){if(typeof message!=='string')return;for(const socket of this.ctx.getWebSockets()){if(socket.readyState===WebSocket.OPEN&&socket!==ws)socket.send(message)}}}
export default {async fetch(request,env){if(request.method==='OPTIONS')return new Response(null,{headers:cors(request,env)});try{const u=new URL(request.url);if(u.pathname==='/api/live'){const origin=request.headers.get('Origin');if(env.ALLOWED_ORIGIN&&origin&&origin!==env.ALLOWED_ORIGIN)return new Response('Forbidden',{status:403});return env.SEAT_ROOM.getByName(SPREADSHEET_ID).fetch(request)}if(u.pathname==='/api/plan'&&request.method==='GET')return json(await plan(env),request,env);if(u.pathname==='/api/seat'&&request.method==='POST'){const cell=await updateSeat(env,await request.json());return json({ok:true,cell},request,env)}if(u.pathname==='/api/seat/add'&&request.method==='POST'){await addSeat(env,await request.json());return json({ok:true},request,env)}return json({error:'Not found'},request,env,404)}catch(e){return json({error:e.message||'Server error'},request,env,500)}}};
