const express=require("express"),sqlite3=require("sqlite3").verbose(),crypto=require("crypto"),path=require("path"),QRCode=require("qrcode");
const app=express(),db=new sqlite3.Database("./qrcar.db"),PORT=3000;app.use(express.json());app.use(express.static(path.join(__dirname,"public")));
const hash=p=>{let s=crypto.randomBytes(16).toString("hex");return [crypto.scryptSync(p,s,64).toString("hex"),s]},run=(q,p=[])=>new Promise((a,b)=>db.run(q,p,function(e){e?b(e):a(this)})),get=(q,p=[])=>new Promise((a,b)=>db.get(q,p,(e,r)=>e?b(e):a(r)));
db.serialize(()=>{db.run(`CREATE TABLE IF NOT EXISTS cars(id INTEGER PRIMARY KEY AUTOINCREMENT,qr_id TEXT UNIQUE,name TEXT,phone TEXT,model TEXT,plate TEXT,telegram TEXT,note TEXT,password_hash TEXT,password_salt TEXT,claimed INTEGER DEFAULT 0)`);db.run(`ALTER TABLE cars ADD COLUMN password_hash TEXT`,()=>{});db.run(`ALTER TABLE cars ADD COLUMN password_salt TEXT`,()=>{});db.run(`ALTER TABLE cars ADD COLUMN claimed INTEGER DEFAULT 0`,()=>{});db.run(`CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,qr_id TEXT)`);db.run(`INSERT OR IGNORE INTO cars(qr_id,name,phone,model,plate,telegram,note,claimed) VALUES(?,?,?,?,?,?,?,0)`,["QRCAR0001","Mavlonov Bobur","+998 93 540 23 08","Chevrolet Malibu","01 A 123 BC","https://t.me/","QR CAR test profili"])});
app.get("/",(q,s)=>s.sendFile(path.join(__dirname,"public/register.html")));app.get("/car/:id",(q,s)=>s.sendFile(path.join(__dirname,"public/car.html")));
app.get("/api/car/:id",async(q,s)=>{try{let x=await get("SELECT qr_id,name,phone,model,plate,telegram,note,claimed FROM cars WHERE qr_id=?",[q.params.id]);x?s.json(x):s.status(404).json({error:"QR profil topilmadi"})}catch(e){s.status(500).json({error:"Server xatosi"})}});
app.post("/api/register",async(q,s)=>{try{let{x}=q.body;let{qrId,name,phone,model,plate,telegram,note,password}=q.body;if(!qrId||!name||!phone||!password)return s.status(400).json({error:"QR ID, ism, telefon va parol majburiy"});if(password.length<6)return s.status(400).json({error:"Parol kamida 6 belgi"});let c=await get("SELECT * FROM cars WHERE qr_id=?",[qrId]);if(!c)return s.status(404).json({error:"QR ID mavjud emas"});if(c.claimed)return s.status(409).json({error:"Bu QR allaqachon ro‘yxatdan o‘tgan"});let[h,sa]=hash(password),t=crypto.randomBytes(32).toString("hex");await run("UPDATE cars SET name=?,phone=?,model=?,plate=?,telegram=?,note=?,password_hash=?,password_salt=?,claimed=1 WHERE qr_id=?",[name,phone,model||"",plate||"",telegram||"",note||"",h,sa,qrId]);await run("INSERT INTO sessions VALUES(?,?)",[t,qrId]);s.json({token:t})}catch(e){s.status(500).json({error:"Server xatosi"})}});
async function auth(q,s,n){let h=q.headers.authorization||"",t=h.startsWith("Bearer ")?h.slice(7):"",x=await get("SELECT qr_id FROM sessions WHERE token=?",[t]);if(!x)return s.status(401).json({error:"Kirish talab qilinadi"});q.qrId=x.qr_id;n()}
app.post("/api/login",async(q,s)=>{let{qrId,password}=q.body,c=await get("SELECT * FROM cars WHERE qr_id=?",[qrId]);if(!c||!c.claimed)return s.status(401).json({error:"QR ID yoki parol noto‘g‘ri"});let h=crypto.scryptSync(password,c.password_salt,64).toString("hex");if(h!==c.password_hash)return s.status(401).json({error:"QR ID yoki parol noto‘g‘ri"});let t=crypto.randomBytes(32).toString("hex");await run("INSERT INTO sessions VALUES(?,?)",[t,qrId]);s.json({token:t})});
app.get("/api/me",auth,async(q,s)=>s.json(await get("SELECT qr_id,name,phone,model,plate,telegram,note FROM cars WHERE qr_id=?",[q.qrId])));
app.put("/api/me",auth,async(q,s)=>{let{name,phone,model,plate,telegram,note}=q.body;if(!name||!phone)return s.status(400).json({error:"Ism va telefon majburiy"});await run("UPDATE cars SET name=?,phone=?,model=?,plate=?,telegram=?,note=? WHERE qr_id=?",[name,phone,model||"",plate||"",telegram||"",note||"",q.qrId]);s.json({ok:true})});

// QR generator (local/admin stage)
app.get("/api/qr/:id.png",async(q,s)=>{
  try{
    let c=await get("SELECT qr_id FROM cars WHERE qr_id=?",[q.params.id]);
    if(!c)return s.status(404).send("QR topilmadi");
    let base=(q.query.base||`${q.protocol}://${q.get("host")}`).replace(/\/$/,"");
    let url=`${base}/car/${encodeURIComponent(c.qr_id)}`;
    let png=await QRCode.toBuffer(url,{width:700,margin:2,errorCorrectionLevel:"H"});
    s.set("Content-Type","image/png"); s.send(png);
  }catch(e){s.status(500).send("QR xatosi")}
});
app.get("/admin.html",(q,s)=>s.sendFile(path.join(__dirname,"public/admin.html")));
app.get("/api/admin/qr-list",async(q,s)=>{
  try{s.json(await new Promise((resolve,reject)=>db.all("SELECT qr_id,name,phone,model,plate,claimed FROM cars ORDER BY id DESC",(e,r)=>e?reject(e):resolve(r))))}
  catch(e){s.status(500).json({error:"Server xatosi"})}
});
app.post("/api/admin/generate-qr",async(q,s)=>{
  try{
    let count=Math.max(1,Math.min(1000,Number(q.body.count)||1));
    let rows=[];
    let n=await get("SELECT COUNT(*) AS n FROM cars");
    let start=(n?.n||0)+1;
    for(let i=0;i<count;i++){
      let id="QRCAR"+String(start+i).padStart(4,"0");
      await run("INSERT OR IGNORE INTO cars(qr_id,claimed) VALUES(?,0)",[id]);
      rows.push(id);
    }
    s.json({ids:rows});
  }catch(e){s.status(500).json({error:"QR yaratishda xato"})}
});

app.listen(PORT,()=>console.log("QR CAR v3 ishga tushdi: http://localhost:3000"));
