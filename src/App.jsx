import { useState, useMemo, useEffect, useCallback } from "react";
import { supabase } from "./supabase";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import "jspdf-autotable";

/* ─── Constantes ─────────────────────────────────────────────────────────── */
const ROLES = {
  empleado:    { label:"Empleado",      bg:"#E6F1FB", text:"#0C447C" },
  responsable: { label:"Responsable",   bg:"#E1F5EE", text:"#085041" },
  proveedor:   { label:"Proveedor",     bg:"#FAEEDA", text:"#633806" },
  admin:       { label:"Administrador", bg:"#EEEDFE", text:"#3C3489" },
};
const CATEGORIAS = ["Ordenador","Periférico","Teléfono","Tablet","Accesorio","Otro"];
const ESTADOS_PROVEEDOR_POST = ["Albarán enviado","Facturado","Pendiente de pago","Pagado","En garantía / incidencia","Solucionado"];
const ESTADOS = ["Nuevo pedido","En preparación","Enviado / en tránsito","Entregado","Albarán enviado","Facturado","Pendiente de pago","Pagado","En garantía / incidencia","Solucionado","Cancelado"];
const ECOLOR = {
  "Nuevo pedido":             { bg:"#EEEDFE", text:"#3C3489", btn:"#AFA9EC" },
  "En preparación":           { bg:"#FAEEDA", text:"#633806", btn:"#FAC775" },
  "Enviado / en tránsito":    { bg:"#E6F1FB", text:"#0C447C", btn:"#85B7EB" },
  "Entregado":                { bg:"#EAF3DE", text:"#27500A", btn:"#97C459" },
  "Albarán enviado":          { bg:"#E1F5EE", text:"#085041", btn:"#9FE1CB" },
  "Facturado":                { bg:"#EEEDFE", text:"#534AB7", btn:"#7F77DD" },
  "Pendiente de pago":        { bg:"#FAECE7", text:"#712B13", btn:"#F0997B" },
  "Pagado":                   { bg:"#EAF3DE", text:"#3B6D11", btn:"#C0DD97" },
  "En garantía / incidencia": { bg:"#FCEBEB", text:"#791F1F", btn:"#F09595" },
  "Solucionado":              { bg:"#EAF3DE", text:"#27500A", btn:"#C0DD97" },
  "Cancelado":                { bg:"#FAECE7", text:"#712B13", btn:"#F0997B" },
};
const SECTION = {
  nuevos:      { label:"Nuevos pedidos pendientes", bg:"#EEEDFE", border:"#AFA9EC", dot:"#7F77DD", text:"#3C3489", cBg:"#3C3489", cText:"#EEEDFE", pulse:true },
  curso:       { label:"Pedidos en curso",          bg:"#E1F5EE", border:"#9FE1CB", dot:"#1D9E75", text:"#085041", cBg:"#085041", cText:"#E1F5EE", pulse:false },
  finalizados: { label:"Finalizados y cancelados",  bg:"#FAECE7", border:"#F0997B", dot:"#D85A30", text:"#712B13", cBg:"#712B13", cText:"#FAECE7", pulse:false },
};

/* ─── Utilidades ─────────────────────────────────────────────────────────── */
const fmtDate = () => { const d=new Date(); return `${String(d.getDate()).padStart(2,"0")}-${String(d.getMonth()+1).padStart(2,"0")}-${d.getFullYear()}`; };
const fmtDateTime = (ts) => { const d=new Date(ts); return `${String(d.getDate()).padStart(2,"0")}-${String(d.getMonth()+1).padStart(2,"0")}-${d.getFullYear()} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`; };
const nextPedidoId = (orders) => "PED-"+String(Math.max(0,...orders.map(o=>parseInt(o.id.split("-")[1]||0)))+1).padStart(3,"0");

const canTransition = (role,from,to) => {
  if (from==="Cancelado") return false;
  if (to==="Nuevo pedido"&&["Entregado",...ESTADOS_PROVEEDOR_POST].includes(from)) return false;
  if (role==="admin") return true;
  if (role==="responsable"&&from==="Nuevo pedido"&&to==="Cancelado") return true;
  if (role==="proveedor") {
    const flow=["Nuevo pedido","En preparación","Enviado / en tránsito"];
    if (flow.indexOf(to)===flow.indexOf(from)+1) return true;
    if (from==="Entregado"&&ESTADOS_PROVEEDOR_POST.includes(to)) return true;
    if (ESTADOS_PROVEEDOR_POST.includes(from)) {
      const pi=ESTADOS_PROVEEDOR_POST.indexOf(from),ti=ESTADOS_PROVEEDOR_POST.indexOf(to);
      if (ti===pi+1) return true;
      if (from!=="En garantía / incidencia"&&to==="En garantía / incidencia") return true;
      return false;
    }
    if (to==="Cancelado") return true;
    return false;
  }
  if (role==="empleado"||role==="responsable") return from==="Enviado / en tránsito"&&to==="Entregado";
  return false;
};
const nextStates = (role,cur) => ESTADOS.filter(s=>s!==cur&&canTransition(role,cur,s));

/* ─── Tokens de color por modo ───────────────────────────────────────────── */
const makeT = (dark) => ({
  bg:      dark ? "#141412" : "#f4f3f0",
  surface: dark ? "#1e1e1c" : "#ffffff",
  surf2:   dark ? "#272724" : "#f4f3f0",
  t1:      dark ? "#e8e6de" : "#1a1a18",
  t2:      dark ? "#9c9a92" : "#6b6a64",
  t3:      dark ? "#5c5a54" : "#9c9a92",
  border:  dark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.08)",
  borderM: dark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.14)",
  accent:  "#185FA5",
  accentBg:"#E6F1FB",
  accentText:"#0C447C",
});

/* ─── Átomos ─────────────────────────────────────────────────────────────── */
const Pill = ({estado}) => {
  const c = ECOLOR[estado]||{bg:"#F1EFE8",text:"#444441"};
  return <span style={{background:c.bg,color:c.text,fontSize:11,fontWeight:500,padding:"3px 10px",borderRadius:20,whiteSpace:"nowrap",display:"inline-block"}}>{estado}</span>;
};

const Avatar = ({name,role,size=32}) => {
  const r = ROLES[role]||ROLES.empleado;
  const ini = name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
  return <div style={{width:size,height:size,borderRadius:"50%",background:r.bg,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*0.34,fontWeight:500,color:r.text,letterSpacing:"-0.02em"}}>{ini}</div>;
};

const RoleBadge = ({role}) => {
  const r = ROLES[role]||ROLES.empleado;
  return <span style={{background:r.bg,color:r.text,fontSize:10,fontWeight:500,padding:"2px 8px",borderRadius:20}}>{r.label}</span>;
};

const Toast = ({msg,type}) => (
  <div style={{position:"fixed",top:16,right:16,zIndex:9999,background:type==="ok"?"#EAF3DE":"#FCEBEB",color:type==="ok"?"#27500A":"#791F1F",padding:"10px 18px",borderRadius:10,fontSize:13,fontWeight:500,border:`0.5px solid ${type==="ok"?"#C0DD97":"#F09595"}`,boxShadow:"0 4px 16px rgba(0,0,0,0.1)",display:"flex",alignItems:"center",gap:8}}>
    <span style={{width:7,height:7,borderRadius:"50%",background:type==="ok"?"#639922":"#E24B4A",display:"inline-block",flexShrink:0}}></span>
    {msg}
  </div>
);

const DarkToggle = ({dark,onToggle,T}) => (
  <button onClick={onToggle} title={dark?"Modo claro":"Modo oscuro"} style={{width:32,height:32,borderRadius:"50%",border:`0.5px solid ${T.border}`,background:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:T.t2,padding:0,flexShrink:0,transition:"border-color .15s"}}>
    {dark
      ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
      : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>}
  </button>
);

const Spinner = ({T}) => (
  <div style={{display:"flex",alignItems:"center",justifyContent:"center",padding:"4rem",color:T.t3,fontSize:13,gap:10}}>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{animation:"spin 1s linear infinite"}}>
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4"/>
    </svg>
    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    Cargando…
  </div>
);

const SearchIcon = () => <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="6.5" cy="6.5" r="4.5"/><path d="M10.5 10.5L14 14"/></svg>;

/* ─── Botones base ───────────────────────────────────────────────────────── */
const mkBtnPrimary = (T) => ({background:"#185FA5",color:"#E6F1FB",border:"none",borderRadius:8,padding:"7px 16px",fontSize:13,fontWeight:500,cursor:"pointer"});
const mkBtnGhost  = (T) => ({background:"transparent",border:`0.5px solid ${T.border}`,borderRadius:8,padding:"7px 14px",fontSize:13,cursor:"pointer",color:T.t2});
const mkBtnDanger = (T) => ({background:"transparent",border:"0.5px solid #F09595",borderRadius:8,padding:"7px 14px",fontSize:13,cursor:"pointer",color:"#791F1F"});
const mkInp       = (T) => ({padding:"8px 10px",borderRadius:8,border:`0.5px solid ${T.borderM}`,fontSize:13,background:T.surface,color:T.t1,width:"100%",outline:"none"});

/* ─── SectionHead ────────────────────────────────────────────────────────── */
function SectionHead({s,count,collapsed,onToggle,pulsing}) {
  return (
    <>
      {pulsing&&<style>{`@keyframes hPulse{0%,100%{opacity:1}50%{opacity:.75}}`}</style>}
      <div onClick={onToggle} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",borderRadius:10,background:s.bg,border:`0.5px solid ${s.border}`,cursor:"pointer",userSelect:"none",animation:pulsing?"hPulse 1.6s ease-in-out infinite":"none",marginBottom:collapsed?0:10,transition:"margin .2s"}}>
        <span style={{width:8,height:8,borderRadius:"50%",background:s.dot,display:"inline-block",flexShrink:0}}></span>
        <span style={{fontSize:13,fontWeight:500,color:s.text,flex:1}}>{s.label}</span>
        <span style={{background:s.cBg,color:s.cText,fontSize:11,fontWeight:500,padding:"2px 9px",borderRadius:20,marginRight:4}}>{count}</span>
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke={s.text} strokeWidth="1.8" style={{transform:collapsed?"rotate(-90deg)":"rotate(0deg)",transition:"transform .2s",opacity:.7}}>
          <path d="M2 4.5L6.5 9 11 4.5"/>
        </svg>
      </div>
    </>
  );
}

/* ─── PulseBar (indicador lateral en tarjeta nueva) ─────────────────────── */
const PulseBar = () => (
  <>
    <style>{`@keyframes bPulse{0%,100%{opacity:1;width:5px}50%{opacity:.7;width:8px}}`}</style>
    <div style={{position:"absolute",left:0,top:0,bottom:0,width:5,borderRadius:"10px 0 0 10px",background:"#7F77DD",animation:"bPulse 1.2s ease-in-out infinite"}}/>
  </>
);

/* ─── LoginForm ──────────────────────────────────────────────────────────── */
function LoginForm({T,onLogin}) {
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [showPwd,setShowPwd]=useState(false);
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(false);
  const inp = {...mkInp(T),padding:"11px 14px",fontSize:14};

  const handleLogin = async () => {
    setLoading(true); setError("");
    const{data,error:e}=await supabase.auth.signInWithPassword({email,password});
    if(e){setError("Email o contraseña incorrectos");setLoading(false);return;}
    const{data:u}=await supabase.from("usuarios").select("*").eq("id",data.user.id).single();
    if(u) onLogin(u); else{setError("Usuario no encontrado");setLoading(false);}
  };

  return (
    <div>
      <div style={{marginBottom:14}}>
        <div style={{fontSize:11,color:T.t3,marginBottom:6,fontWeight:500,letterSpacing:"0.04em",textTransform:"uppercase"}}>Email</div>
        <input type="email" value={email} onChange={e=>{setEmail(e.target.value);setError("");}} placeholder="correo@empresa.com" style={inp} onKeyDown={e=>e.key==="Enter"&&handleLogin()}/>
      </div>
      <div style={{marginBottom:6}}>
        <div style={{fontSize:11,color:T.t3,marginBottom:6,fontWeight:500,letterSpacing:"0.04em",textTransform:"uppercase"}}>Contraseña</div>
        <div style={{position:"relative"}}>
          <input type={showPwd?"text":"password"} value={password} onChange={e=>{setPassword(e.target.value);setError("");}} placeholder="••••••••" style={{...inp,paddingRight:44}} onKeyDown={e=>e.key==="Enter"&&handleLogin()}/>
          <button onClick={()=>setShowPwd(p=>!p)} style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",color:T.t3,display:"flex",alignItems:"center",padding:0}}>
            {showPwd
              ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
              : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>}
          </button>
        </div>
      </div>
      {error&&<div style={{fontSize:12,color:"#791F1F",background:"#FCEBEB",padding:"8px 12px",borderRadius:8,marginTop:8,border:"0.5px solid #F09595"}}>{error}</div>}
      <div style={{marginBottom:20}}/>
      <button onClick={handleLogin} disabled={loading} style={{...mkBtnPrimary(T),width:"100%",padding:"11px",borderRadius:10,fontSize:14,opacity:loading?.7:1}}>
        {loading?"Entrando…":"Entrar"}
      </button>
    </div>
  );
}

/* ─── MetricCard ─────────────────────────────────────────────────────────── */
const MetricCard = ({label,val,bg,text,T}) => (
  <div style={{background:bg||T.surf2,borderRadius:10,padding:"12px 16px",border:`0.5px solid ${T.border}`}}>
    <div style={{fontSize:11,color:text||T.t3,marginBottom:4,fontWeight:500}}>{label}</div>
    <div style={{fontSize:22,fontWeight:500,color:text||T.t1,lineHeight:1}}>{val}</div>
  </div>
);

/* ─── EstadoModal ────────────────────────────────────────────────────────── */
function EstadoModal({order:o,next,T,onSelect,onClose}) {
  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.surface,borderRadius:16,padding:"1.75rem",width:"100%",maxWidth:420,border:`0.5px solid ${T.borderM}`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20}}>
          <div>
            <div style={{fontSize:11,color:T.t3,marginBottom:4,textTransform:"uppercase",letterSpacing:"0.06em"}}>Cambiar estado</div>
            <div style={{fontSize:17,fontWeight:500,color:T.t1,lineHeight:1.3}}>{o.producto}</div>
            <div style={{fontSize:12,color:T.t3,marginTop:3,fontFamily:"monospace"}}>{o.id}</div>
          </div>
          <button onClick={onClose} style={{background:T.surf2,border:"none",borderRadius:"50%",width:30,height:30,cursor:"pointer",fontSize:14,color:T.t2,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>✕</button>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {next.map(s=>{
            const c=ECOLOR[s];
            return (
              <button key={s} onClick={()=>{onSelect(s);onClose();}} style={{width:"100%",padding:"12px 16px",borderRadius:10,border:`1px solid ${c.btn}`,background:c.bg,color:c.text,fontSize:14,fontWeight:500,cursor:"pointer",display:"flex",alignItems:"center",gap:10,transition:"transform .1s"}}
                onMouseEnter={e=>e.currentTarget.style.transform="scale(1.01)"}
                onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}>
                <span style={{width:8,height:8,borderRadius:"50%",background:c.btn,flexShrink:0}}></span>
                {s}
              </button>
            );
          })}
        </div>
        <div style={{marginTop:16,paddingTop:16,borderTop:`0.5px solid ${T.border}`,fontSize:11,color:T.t3,textAlign:"center"}}>Pulsa fuera para cancelar</div>
      </div>
    </div>
  );
}

/* ─── OrderRow ───────────────────────────────────────────────────────────── */
function OrderRow({order:o,user,idx,highlight,T,groupColors,onSelect,onChangeEstado}) {
  const next=nextStates(user.role,o.estado);
  const [showEstado,setShowEstado]=useState(false);
  let bg,border;
  if(highlight){bg=idx%2===0?"#EEEDFE":"#E8E6F8";border="1.5px solid #7F77DD";}
  else if(groupColors){bg=idx%2===0?groupColors.light:groupColors.dark;border=`0.5px solid ${groupColors.border}`;}
  else{bg=idx%2===0?T.surface:T.surf2;border=`0.5px solid ${T.border}`;}

  return (
    <>
      {showEstado&&<EstadoModal order={o} next={next} T={T} onSelect={onChangeEstado} onClose={()=>setShowEstado(false)}/>}
      <div onClick={e=>{if(e.target.tagName==="BUTTON")return;if(next.length>0)setShowEstado(true);else onSelect();}}
        style={{background:bg,border,borderRadius:10,padding:"12px 16px",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap",position:"relative",overflow:"hidden",cursor:"pointer",transition:"box-shadow .15s"}}
        onMouseEnter={e=>e.currentTarget.style.boxShadow=`0 2px 12px rgba(0,0,0,0.06)`}
        onMouseLeave={e=>e.currentTarget.style.boxShadow="none"}>
        {highlight&&<PulseBar/>}
        <div style={{width:74,fontSize:11,fontWeight:500,color:T.t3,fontFamily:"monospace",flexShrink:0}}>{o.id}</div>
        <div style={{flex:1,minWidth:140}}>
          <div style={{fontSize:13,fontWeight:500,color:highlight?"#3C3489":T.t1,marginBottom:1}}>{o.producto}</div>
          <div style={{fontSize:11,color:T.t3}}>{o.categoria} · {o.cantidad} ud.{o.precio?` · €${(o.precio*o.cantidad).toLocaleString("es-ES")}`:""}</div>
        </div>
        {["admin","proveedor","responsable"].includes(user.role)&&(
          <div style={{display:"flex",alignItems:"center",gap:6,minWidth:110}}>
            <Avatar name={o.solicitante} role="empleado" size={22}/>
            <span style={{fontSize:12,color:T.t2}}>{o.solicitante}</span>
          </div>
        )}
        <div style={{minWidth:80}}><Pill estado={o.estado}/></div>
        <div style={{fontSize:11,color:T.t3,minWidth:96}}>
          {o.estado==="Entregado"&&o.fechaEntrega
            ? <span style={{color:"#27500A",fontWeight:500}}>Entregado {o.fechaEntrega}</span>
            : o.fechaEstimada?`Est. ${o.fechaEstimada}`:"—"}
        </div>
        <button onClick={e=>{e.stopPropagation();onSelect();}} style={{fontSize:12,padding:"5px 12px",borderRadius:8,border:`0.5px solid ${T.border}`,background:T.surface,color:T.t2,cursor:"pointer"}}>Ver</button>
      </div>
    </>
  );
}

/* ─── DetailPanel ────────────────────────────────────────────────────────── */
function DetailPanel({order:o,user,T,onClose,onUpdate,onDelete,onChangeEstado}) {
  const [editing,setEditing]=useState(false);
  const [form,setForm]=useState({...o});
  const next=nextStates(user.role,o.estado);
  const canEdit=user.role==="admin"||user.role==="proveedor";
  const provKeys=["tracking","fechaEstimada","notas","notasIncidencia"];
  const editable=k=>editing&&(user.role==="admin"||provKeys.includes(k));
  const save=async()=>{await onUpdate(form);setEditing(false);};
  const inp=mkInp(T);

  const Field=({label,k,type="text",opts=null})=>(
    <div style={{marginBottom:14}}>
      <div style={{fontSize:11,color:T.t3,marginBottom:4,fontWeight:500,textTransform:"uppercase",letterSpacing:"0.04em"}}>{label}</div>
      {editable(k)
        ? opts
          ? <select value={form[k]||""} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} style={inp}>{opts.map(v=><option key={v}>{v}</option>)}</select>
          : type==="textarea"
            ? <textarea value={form[k]||""} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} rows={3} style={{...inp,resize:"vertical",height:"auto"}}/>
            : <input type={type} value={form[k]||""} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} style={inp}/>
        : <div style={{fontSize:13,color:T.t1,paddingTop:2}}>{form[k]||<span style={{color:T.t3}}>—</span>}</div>}
    </div>
  );

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.2)",zIndex:100,display:"flex",justifyContent:"flex-end"}} onClick={onClose}>
      <div style={{width:"100%",maxWidth:480,background:T.surface,height:"100%",overflowY:"auto",padding:"1.5rem",display:"flex",flexDirection:"column",gap:14,borderLeft:`0.5px solid ${T.borderM}`}} onClick={e=>e.stopPropagation()}>

        {/* Header */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div>
            <div style={{fontSize:11,color:T.t3,marginBottom:3,fontFamily:"monospace"}}>{o.id}</div>
            <div style={{fontSize:15,fontWeight:500,color:T.t1,lineHeight:1.3}}>{o.producto}</div>
            <div style={{fontSize:11,color:T.t3,marginTop:3}}>Solicitado el {o.fechaSolicitud}</div>
          </div>
          <button onClick={onClose} style={{background:"none",border:`0.5px solid ${T.border}`,borderRadius:"50%",width:30,height:30,cursor:"pointer",color:T.t2,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:14}}>✕</button>
        </div>

        <Pill estado={o.estado}/>

        {/* Cambio de estado */}
        {next.length>0&&(
          <div>
            <div style={{fontSize:11,color:T.t3,marginBottom:8,textTransform:"uppercase",letterSpacing:"0.04em",fontWeight:500}}>Cambiar estado</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {next.map(s=>{const c=ECOLOR[s];return(
                <button key={s} onClick={()=>{onChangeEstado(s);setForm(f=>({...f,estado:s}));}} style={{fontSize:12,padding:"5px 12px",borderRadius:20,border:`1px solid ${c.btn}`,background:c.bg,color:c.text,cursor:"pointer",fontWeight:500}}>→ {s}</button>
              );})}
            </div>
          </div>
        )}

        <div style={{height:"0.5px",background:T.border}}/>

        <Field label="Producto" k="producto"/>
        <Field label="Categoría" k="categoria" opts={CATEGORIAS}/>
        <Field label="Cantidad" k="cantidad" type="number"/>
        <Field label="Precio unitario (€)" k="precio" type="number"/>
        {form.precio>0&&(
          <div style={{marginBottom:14,background:"#EEEDFE",borderRadius:8,padding:"10px 14px"}}>
            <div style={{fontSize:11,color:"#534AB7",marginBottom:2,fontWeight:500}}>Importe total</div>
            <div style={{fontSize:16,fontWeight:500,color:"#3C3489"}}>€{(form.precio*form.cantidad).toLocaleString("es-ES")}</div>
          </div>
        )}
        <Field label="Solicitante" k="solicitante"/>
        <Field label="Fecha estimada" k="fechaEstimada" type="date"/>
        <Field label="Nº seguimiento / albarán" k="tracking"/>
        <Field label="Notas" k="notas" type="textarea"/>

        {["En garantía / incidencia","Solucionado"].includes(form.estado)&&(
          <div style={{marginBottom:14}}>
            <div style={{fontSize:11,color:"#791F1F",marginBottom:4,fontWeight:500,textTransform:"uppercase",letterSpacing:"0.04em"}}>Notas de incidencia / garantía</div>
            {editing
              ? <textarea value={form.notasIncidencia||""} onChange={e=>setForm(f=>({...f,notasIncidencia:e.target.value}))} rows={4} placeholder="Describe el problema…" style={{...inp,resize:"vertical",height:"auto",border:"1px solid #F09595",background:"#FCEBEB"}}/>
              : <div style={{fontSize:13,color:"#791F1F",background:"#FCEBEB",borderRadius:8,padding:"10px 12px",border:"0.5px solid #F09595",minHeight:60,whiteSpace:"pre-wrap"}}>{form.notasIncidencia||<span style={{opacity:.5}}>Sin notas de incidencia</span>}</div>}
          </div>
        )}

        <div style={{display:"flex",gap:8,marginTop:"auto",paddingTop:16,borderTop:`0.5px solid ${T.border}`}}>
          {canEdit&&!editing&&<button onClick={()=>setEditing(true)} style={mkBtnPrimary(T)}>Editar</button>}
          {editing&&<button onClick={save} style={mkBtnPrimary(T)}>Guardar</button>}
          {editing&&<button onClick={()=>{setForm({...o});setEditing(false);}} style={mkBtnGhost(T)}>Cancelar</button>}
          {user.role==="admin"&&!editing&&<button onClick={onDelete} style={mkBtnDanger(T)}>Eliminar</button>}
        </div>
      </div>
    </div>
  );
}

/* ─── NewOrderModal ──────────────────────────────────────────────────────── */
function NewOrderModal({user,T,onClose,onCreate}) {
  const [form,setForm]=useState({producto:"",categoria:"Ordenador",cantidad:1,precio:"",fechaEstimada:"",notas:""});
  const [saving,setSaving]=useState(false);
  const f=(k,v)=>setForm(p=>({...p,[k]:v}));
  const valid=form.producto&&form.cantidad>0;
  const inp=mkInp(T);
  const handle=async()=>{if(!valid)return;setSaving(true);await onCreate(form);setSaving(false);};
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.35)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={onClose}>
      <div style={{background:T.surface,borderRadius:14,padding:"1.75rem",width:"100%",maxWidth:460,maxHeight:"90vh",overflowY:"auto",border:`0.5px solid ${T.borderM}`}} onClick={e=>e.stopPropagation()}>
        <div style={{fontSize:16,fontWeight:500,color:T.t1,marginBottom:20}}>Nuevo pedido</div>
        <div style={{marginBottom:14}}><div style={{fontSize:11,color:T.t3,marginBottom:4,fontWeight:500,textTransform:"uppercase",letterSpacing:"0.04em"}}>Producto</div><input value={form.producto} onChange={e=>f("producto",e.target.value)} placeholder='Ej. MacBook Pro 14"' style={inp}/></div>
        <div style={{marginBottom:14}}><div style={{fontSize:11,color:T.t3,marginBottom:4,fontWeight:500,textTransform:"uppercase",letterSpacing:"0.04em"}}>Categoría</div><select value={form.categoria} onChange={e=>f("categoria",e.target.value)} style={inp}>{CATEGORIAS.map(c=><option key={c}>{c}</option>)}</select></div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
          <div><div style={{fontSize:11,color:T.t3,marginBottom:4,fontWeight:500,textTransform:"uppercase",letterSpacing:"0.04em"}}>Cantidad</div><input type="number" min={1} value={form.cantidad} onChange={e=>f("cantidad",+e.target.value)} style={inp}/></div>
          <div><div style={{fontSize:11,color:T.t3,marginBottom:4,fontWeight:500,textTransform:"uppercase",letterSpacing:"0.04em"}}>Precio (€) · opcional</div><input type="number" min={0} value={form.precio} placeholder="—" onChange={e=>f("precio",+e.target.value)} style={inp}/></div>
        </div>
        <div style={{marginBottom:14}}><div style={{fontSize:11,color:T.t3,marginBottom:4,fontWeight:500,textTransform:"uppercase",letterSpacing:"0.04em"}}>Fecha estimada</div><input type="date" value={form.fechaEstimada} onChange={e=>f("fechaEstimada",e.target.value)} style={inp}/></div>
        <div style={{marginBottom:20}}><div style={{fontSize:11,color:T.t3,marginBottom:4,fontWeight:500,textTransform:"uppercase",letterSpacing:"0.04em"}}>Notas</div><textarea value={form.notas} onChange={e=>f("notas",e.target.value)} rows={3} style={{...inp,resize:"vertical",height:"auto"}}/></div>
        {form.precio>0&&form.cantidad>0&&(
          <div style={{background:"#EEEDFE",borderRadius:8,padding:"10px 14px",marginBottom:16}}>
            <span style={{fontSize:12,color:"#534AB7"}}>Importe total: </span>
            <span style={{fontSize:14,fontWeight:500,color:"#3C3489"}}>€{(form.precio*form.cantidad).toLocaleString("es-ES")}</span>
          </div>
        )}
        <div style={{display:"flex",gap:8}}>
          <button disabled={!valid||saving} onClick={handle} style={{...mkBtnPrimary(T),opacity:valid&&!saving?1:.5,cursor:valid&&!saving?"pointer":"not-allowed"}}>{saving?"Guardando…":"Crear pedido"}</button>
          <button onClick={onClose} style={mkBtnGhost(T)}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

/* ─── UsersPanel ─────────────────────────────────────────────────────────── */
function UsersPanel({users,currentUser,T,onNew,onEdit,onDelete}) {
  const [search,setSearch]=useState("");
  const [confirmId,setConfirmId]=useState(null);
  const visible=users.filter(u=>u.name.toLowerCase().includes(search.toLowerCase())||u.email.toLowerCase().includes(search.toLowerCase()));
  const inp=mkInp(T);
  return (
    <div>
      <div style={{display:"flex",gap:10,marginBottom:12,alignItems:"center"}}>
        <div style={{flex:1,position:"relative"}}>
          <div style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:T.t3,pointerEvents:"none"}}><SearchIcon/></div>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar usuario…" style={{...inp,paddingLeft:32}}/>
        </div>
        <button onClick={onNew} style={mkBtnPrimary(T)}>+ Nuevo usuario</button>
      </div>
      <div style={{background:"#FAEEDA",border:"0.5px solid #FAC775",borderRadius:10,padding:"10px 14px",marginBottom:16,fontSize:12,color:"#633806"}}>
        Para crear usuarios nuevos ve a <strong>Supabase → SQL Editor</strong> y ejecuta los comandos proporcionados.
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:10}}>
        {visible.map(u=>{
          const isSelf=u.id===currentUser.id;
          return (
            <div key={u.id} style={{background:T.surface,border:`0.5px solid ${T.border}`,borderRadius:12,padding:"16px"}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
                <Avatar name={u.name} role={u.role} size={40}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:500,color:T.t1,display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
                    {u.name}
                    {isSelf&&<span style={{fontSize:10,background:"#EEEDFE",color:"#3C3489",padding:"1px 6px",borderRadius:20}}>tú</span>}
                  </div>
                  <div style={{fontSize:11,color:T.t3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{u.email}</div>
                </div>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <RoleBadge role={u.role}/>
                <div style={{display:"flex",gap:6}}>
                  <button onClick={()=>onEdit(u)} style={{fontSize:11,padding:"4px 10px",borderRadius:8,border:`0.5px solid ${T.border}`,background:T.surface,color:T.t1,cursor:"pointer"}}>Editar</button>
                  {!isSelf&&(confirmId===u.id
                    ? <div style={{display:"flex",gap:4,alignItems:"center"}}>
                        <span style={{fontSize:11,color:"#791F1F"}}>¿Seguro?</span>
                        <button onClick={()=>{onDelete(u.id);setConfirmId(null);}} style={{fontSize:11,padding:"3px 8px",borderRadius:8,border:"0.5px solid #F09595",background:"#FCEBEB",color:"#791F1F",cursor:"pointer"}}>Sí</button>
                        <button onClick={()=>setConfirmId(null)} style={{fontSize:11,padding:"3px 8px",borderRadius:8,border:`0.5px solid ${T.border}`,background:T.surface,color:T.t1,cursor:"pointer"}}>No</button>
                      </div>
                    : <button onClick={()=>setConfirmId(u.id)} style={{fontSize:11,padding:"4px 10px",borderRadius:8,border:"0.5px solid #F09595",background:"none",color:"#791F1F",cursor:"pointer"}}>Eliminar</button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── UserModal ──────────────────────────────────────────────────────────── */
function UserModal({userData,T,onSave,onClose}) {
  const [form,setForm]=useState(userData?{...userData,password:""}:{name:"",email:"",role:"empleado",password:""});
  const [showPwd,setShowPwd]=useState(false);
  const [saving,setSaving]=useState(false);
  const f=(k,v)=>setForm(p=>({...p,[k]:v}));
  const valid=form.name&&form.email&&(userData?true:!!form.password);
  const inp=mkInp(T);
  const handleSave=async()=>{if(!valid)return;setSaving(true);const data={...form};if(userData&&!form.password)data.password=userData.password;await onSave(data);setSaving(false);};
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.35)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={onClose}>
      <div style={{background:T.surface,borderRadius:14,padding:"1.75rem",width:"100%",maxWidth:440,maxHeight:"90vh",overflowY:"auto",border:`0.5px solid ${T.borderM}`}} onClick={e=>e.stopPropagation()}>
        <div style={{fontSize:16,fontWeight:500,color:T.t1,marginBottom:20}}>{userData?"Editar usuario":"Nuevo usuario"}</div>
        <div style={{marginBottom:14}}><div style={{fontSize:11,color:T.t3,marginBottom:4,fontWeight:500,textTransform:"uppercase",letterSpacing:"0.04em"}}>Nombre completo</div><input value={form.name} onChange={e=>f("name",e.target.value)} placeholder="Nombre completo" style={inp}/></div>
        <div style={{marginBottom:14}}><div style={{fontSize:11,color:T.t3,marginBottom:4,fontWeight:500,textTransform:"uppercase",letterSpacing:"0.04em"}}>Email</div><input type="email" value={form.email} onChange={e=>f("email",e.target.value)} placeholder="correo@empresa.com" style={inp}/></div>
        <div style={{marginBottom:14}}>
          <div style={{fontSize:11,color:T.t3,marginBottom:4,fontWeight:500,textTransform:"uppercase",letterSpacing:"0.04em"}}>Contraseña{userData&&<span style={{fontWeight:400,textTransform:"none"}}> · dejar vacío para no cambiar</span>}</div>
          <div style={{position:"relative"}}>
            <input type={showPwd?"text":"password"} value={form.password} onChange={e=>f("password",e.target.value)} placeholder={userData?"••••••••":"Nueva contraseña"} style={{...inp,paddingRight:40}}/>
            <button onClick={()=>setShowPwd(p=>!p)} style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",fontSize:14,color:T.t3}}>{showPwd?"🙈":"👁️"}</button>
          </div>
        </div>
        <div style={{marginBottom:20}}>
          <div style={{fontSize:11,color:T.t3,marginBottom:4,fontWeight:500,textTransform:"uppercase",letterSpacing:"0.04em"}}>Rol</div>
          <select value={form.role} onChange={e=>f("role",e.target.value)} style={inp}>{Object.entries(ROLES).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select>
        </div>
        {form.role&&(
          <div style={{background:ROLES[form.role].bg,borderRadius:8,padding:"10px 14px",marginBottom:16,display:"flex",alignItems:"center",gap:8,border:`0.5px solid ${T.border}`}}>
            <Avatar name={form.name||"?"} role={form.role} size={32}/>
            <div>
              <div style={{fontSize:13,fontWeight:500,color:ROLES[form.role].text}}>{form.name||"Nombre del usuario"}</div>
              <div style={{fontSize:11,color:ROLES[form.role].text,opacity:.8}}>{ROLES[form.role].label}</div>
            </div>
          </div>
        )}
        <div style={{display:"flex",gap:8}}>
          <button disabled={!valid||saving} onClick={handleSave} style={{...mkBtnPrimary(T),opacity:valid&&!saving?1:.5,cursor:valid&&!saving?"pointer":"not-allowed"}}>{saving?"Guardando…":userData?"Guardar cambios":"Crear usuario"}</button>
          <button onClick={onClose} style={mkBtnGhost(T)}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

/* ─── App principal ──────────────────────────────────────────────────────── */
export default function App() {
  const [dark,setDark]=useState(()=>JSON.parse(localStorage.getItem("dark")||"false"));
  const [user,setUser]=useState(null);
  const [orders,setOrders]=useState([]);
  const [historial,setHistorial]=useState([]);
  const [loading,setLoading]=useState(false);
  const [tab,setTab]=useState("pedidos");
  const [users,setUsers]=useState([]);
  const [selected,setSelected]=useState(null);
  const [showForm,setShowForm]=useState(false);
  const [filterEstado,setFilterEstado]=useState("Todos");
  const [filterCat,setFilterCat]=useState("Todas");
  const [search,setSearch]=useState("");
  const [histSearch,setHistSearch]=useState("");
  const [toast,setToast]=useState(null);
  const [userModal,setUserModal]=useState(null);
  const [collapsed,setCollapsed]=useState({nuevos:true,curso:true,finalizados:true});

  const T = makeT(dark);
  useEffect(()=>{localStorage.setItem("dark",JSON.stringify(dark));},[dark]);
  const showToast=(msg,type="ok")=>{setToast({msg,type});setTimeout(()=>setToast(null),3000);};
  const toggle=(key)=>setCollapsed(p=>({...p,[key]:!p[key]}));

  const loadOrders=useCallback(async()=>{
    setLoading(true);
    const{data}=await supabase.from("pedidos").select("*").order("created_at",{ascending:false});
    if(data) setOrders(data.map(o=>({id:o.id,producto:o.producto,categoria:o.categoria,cantidad:o.cantidad,precio:o.precio,solicitante:o.solicitante,estado:o.estado,fechaSolicitud:o.fecha_solicitud,fechaEstimada:o.fecha_estimada||"",fechaEntrega:o.fecha_entrega||"",tracking:o.tracking||"",notas:o.notas||"",notasIncidencia:o.notas_incidencia||""})));
    setLoading(false);
  },[]);

  const loadUsers=useCallback(async()=>{
    const{data}=await supabase.from("usuarios").select("*");
    if(data) setUsers(data);
  },[]);

  const loadHistorial=useCallback(async(currentUser)=>{
    let q=supabase.from("historial").select("*").order("created_at",{ascending:false});
    if(!["admin","proveedor"].includes(currentUser.role)){
      const myOrders=await supabase.from("pedidos").select("id").eq("solicitante",currentUser.name);
      const ids=(myOrders.data||[]).map(o=>o.id);
      if(ids.length===0){setHistorial([]);return;}
      q=q.in("pedido_id",ids);
    }
    const{data}=await q;
    if(data) setHistorial(data);
  },[]);

  useEffect(()=>{if(user){loadOrders();loadUsers();loadHistorial(user);}},[user,loadOrders,loadUsers,loadHistorial]);

  useEffect(()=>{
    if(!user) return;
    const sub=supabase.channel("realtime-changes")
      .on("postgres_changes",{event:"*",schema:"public",table:"pedidos"},()=>loadOrders())
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"historial"},payload=>{
        const h=payload.new;
        const esVisible=["admin","proveedor"].includes(user.role)||orders.some(o=>o.id===h.pedido_id&&o.solicitante===user.name);
        if(esVisible) setHistorial(p=>[h,...p]);
      }).subscribe();
    return()=>supabase.removeChannel(sub);
  },[user,orders,loadOrders]);

  const exportXLSX=(data,nombre)=>{
    const filas=data.map(h=>({"Fecha":fmtDateTime(h.created_at),"Pedido":h.pedido_id,"Usuario":h.usuario_nombre,"Rol":ROLES[h.usuario_role]?.label||h.usuario_role,"Estado anterior":h.estado_anterior||"—","Estado nuevo":h.estado_nuevo,"Notas":h.notas||""}));
    const ws=XLSX.utils.json_to_sheet(filas);
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,ws,"Historial");
    XLSX.writeFile(wb,`${nombre}.xlsx`);
  };

  const exportPDF=(data,nombre)=>{
    const doc=new jsPDF({orientation:"landscape"});
    doc.setFontSize(14);doc.text("Historial de pedidos",14,16);
    doc.setFontSize(9);doc.setTextColor(120);
    doc.text(`Exportado el ${fmtDateTime(new Date().toISOString())} · ${data.length} entradas`,14,22);
    doc.autoTable({startY:28,head:[["Fecha","Pedido","Usuario","Rol","Estado anterior","Estado nuevo","Notas"]],body:data.map(h=>[fmtDateTime(h.created_at),h.pedido_id,h.usuario_nombre,ROLES[h.usuario_role]?.label||h.usuario_role,h.estado_anterior||"—",h.estado_nuevo,h.notas||""]),styles:{fontSize:8,cellPadding:3},headStyles:{fillColor:[24,95,165],textColor:255,fontStyle:"bold"},alternateRowStyles:{fillColor:[230,241,251]}});
    doc.save(`${nombre}.pdf`);
  };

  const visible=useMemo(()=>{
    let r=orders;
    if(user&&!["admin","proveedor","responsable"].includes(user.role)) r=r.filter(o=>o.solicitante===user.name);
    if(filterEstado!=="Todos") r=r.filter(o=>o.estado===filterEstado);
    if(filterCat!=="Todas") r=r.filter(o=>o.categoria===filterCat);
    if(search) r=r.filter(o=>[o.producto,o.id,o.solicitante].some(v=>v.toLowerCase().includes(search.toLowerCase())));
    return r;
  },[orders,user,filterEstado,filterCat,search]);

  const visibleHist=useMemo(()=>{
    if(!histSearch) return historial;
    return historial.filter(h=>[h.pedido_id,h.usuario_nombre,h.estado_anterior,h.estado_nuevo,h.notas].some(v=>v&&v.toLowerCase().includes(histSearch.toLowerCase())));
  },[historial,histSearch]);

  const addHistorial=async(pedidoId,estadoAnterior,estadoNuevo,notas="")=>{
    await supabase.from("historial").insert({pedido_id:pedidoId,usuario_nombre:user.name,usuario_role:user.role,estado_anterior:estadoAnterior,estado_nuevo:estadoNuevo,notas});
  };

  const updateOrder=async(id,changes)=>{
    const dbChanges={};
    if(changes.estado!==undefined)          dbChanges.estado=changes.estado;
    if(changes.producto)                    dbChanges.producto=changes.producto;
    if(changes.categoria)                   dbChanges.categoria=changes.categoria;
    if(changes.cantidad)                    dbChanges.cantidad=changes.cantidad;
    if(changes.precio!==undefined)          dbChanges.precio=changes.precio;
    if(changes.solicitante)                 dbChanges.solicitante=changes.solicitante;
    if(changes.fechaEstimada!==undefined)   dbChanges.fecha_estimada=changes.fechaEstimada||null;
    if(changes.fechaEntrega!==undefined)    dbChanges.fecha_entrega=changes.fechaEntrega||"";
    if(changes.tracking!==undefined)        dbChanges.tracking=changes.tracking||"";
    if(changes.notas!==undefined)           dbChanges.notas=changes.notas||"";
    if(changes.notasIncidencia!==undefined) dbChanges.notas_incidencia=changes.notasIncidencia||"";
    await supabase.from("pedidos").update(dbChanges).eq("id",id);
    setOrders(p=>p.map(o=>o.id===id?{...o,...changes}:o));
    setSelected(p=>p?.id===id?{...p,...changes}:p);
  };

  const deleteOrder=async(id)=>{
    await supabase.from("pedidos").delete().eq("id",id);
    setOrders(p=>p.filter(o=>o.id!==id));
    setSelected(null);showToast("Pedido eliminado");
  };

  const changeEstado=async(id,estado)=>{
    const order=orders.find(o=>o.id===id);
    const ch={estado};
    if(estado==="Entregado") ch.fechaEntrega=fmtDate();
    await updateOrder(id,ch);
    await addHistorial(id,order?.estado||"",estado);
    showToast(`Estado → ${estado}`);
  };

  const createOrder=async(data)=>{
    const newId=nextPedidoId(orders);
    const row={id:newId,producto:data.producto,categoria:data.categoria,cantidad:data.cantidad,precio:data.precio||0,solicitante:user.name,estado:"Nuevo pedido",fecha_solicitud:new Date().toISOString().slice(0,10),fecha_estimada:data.fechaEstimada||null,tracking:"",fecha_entrega:"",notas:data.notas||"",notas_incidencia:""};
    await supabase.from("pedidos").insert(row);
    await addHistorial(newId,"","Nuevo pedido","Pedido creado");
    await loadOrders();
    showToast("Pedido creado");
  };

  const saveUser=async(data)=>{
    if(data.id){
      await supabase.from("usuarios").update({name:data.name,email:data.email,role:data.role}).eq("id",data.id);
      setUsers(p=>p.map(u=>u.id===data.id?{...u,...data}:u));
      if(user.id===data.id) setUser(d=>({...d,...data}));
      showToast("Usuario actualizado");
    }else{
      const{data:authData,error}=await supabase.auth.signUp({email:data.email,password:data.password});
      if(error){showToast("Error: "+error.message,"err");return;}
      await supabase.from("usuarios").insert({id:authData.user.id,name:data.name,email:data.email,role:data.role});
      await loadUsers();
      showToast("Usuario creado");
    }
    setUserModal(null);
  };

  const deleteUser=async(id)=>{
    if(id===user.id){showToast("No puedes eliminarte","err");return;}
    await supabase.from("usuarios").delete().eq("id",id);
    setUsers(p=>p.filter(u=>u.id!==id));
    showToast("Usuario eliminado");
  };

  /* ── Login screen ─────────────────────────────────────────────────────── */
  if(!user) return (
    <div style={{minHeight:"100vh",background:T.bg,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Inter',system-ui,sans-serif",padding:"1.5rem"}}>
      <div style={{display:"flex",width:"100%",maxWidth:820,borderRadius:16,overflow:"hidden",border:`0.5px solid ${T.borderM}`,minHeight:520}}>
        {/* Panel izquierdo */}
        <div style={{width:240,flexShrink:0,background:"#185FA5",padding:"2rem 1.5rem",display:"flex",flexDirection:"column",justifyContent:"space-between"}}>
          <div>
            <div style={{width:44,height:44,borderRadius:12,background:"rgba(255,255,255,0.15)",display:"flex",alignItems:"center",justifyContent:"center",marginBottom:"1.5rem"}}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="1.8"><path d="M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/></svg>
            </div>
            <div style={{color:"#fff",fontSize:18,fontWeight:500,lineHeight:1.4,marginBottom:6}}>Portal de pedidos</div>
            <div style={{color:"rgba(255,255,255,0.55)",fontSize:13,lineHeight:1.6,marginBottom:"1.5rem"}}>Sistema de gestión empresa–proveedor</div>
            {["Seguimiento en tiempo real","Control por roles","Historial completo","Acceso desde cualquier lugar"].map(feat=>(
              <div key={feat} style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                <div style={{width:6,height:6,borderRadius:"50%",background:"rgba(255,255,255,0.4)",flexShrink:0}}></div>
                <div style={{color:"rgba(255,255,255,0.7)",fontSize:12}}>{feat}</div>
              </div>
            ))}
          </div>
          <div style={{color:"rgba(255,255,255,0.2)",fontSize:11}}>v1.0</div>
        </div>
        {/* Panel derecho */}
        <div style={{flex:1,background:T.surface,padding:"2.5rem 2rem",display:"flex",flexDirection:"column",justifyContent:"center"}}>
          <div style={{marginBottom:28}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <div style={{display:"inline-flex",alignItems:"center",gap:5,background:"#E6F1FB",color:"#0C447C",fontSize:11,fontWeight:500,padding:"3px 10px",borderRadius:20}}>
                <div style={{width:6,height:6,borderRadius:"50%",background:"#185FA5"}}></div>
                Portal activo
              </div>
              <DarkToggle dark={dark} onToggle={()=>setDark(d=>!d)} T={T}/>
            </div>
            <div style={{fontSize:22,fontWeight:500,color:T.t1,marginBottom:6}}>Bienvenido</div>
            <div style={{fontSize:14,color:T.t2}}>Introduce tus credenciales para acceder</div>
          </div>
          <LoginForm T={T} onLogin={u=>{setUser(u);setTab("pedidos");setCollapsed({nuevos:true,curso:true,finalizados:true});}}/>
          <div style={{height:"0.5px",background:T.border,margin:"20px 0"}}/>
          <div style={{fontSize:12,color:T.t3,textAlign:"center"}}>¿Problemas para acceder? Contacta con el administrador</div>
        </div>
      </div>
    </div>
  );

  /* ── App screen ───────────────────────────────────────────────────────── */
  const nuevos      = user.role==="proveedor" ? visible.filter(o=>o.estado==="Nuevo pedido") : [];
  const enCurso     = visible.filter(o=>!["Entregado","Cancelado",...ESTADOS_PROVEEDOR_POST].includes(o.estado)&&(user.role!=="proveedor"||o.estado!=="Nuevo pedido"));
  const finalizados = visible.filter(o=>["Entregado","Cancelado",...ESTADOS_PROVEEDOR_POST].includes(o.estado));
  const rp=(o,i,highlight=false,gc=null)=>({order:o,user,idx:i,highlight,T,groupColors:gc,onSelect:()=>setSelected(o),onChangeEstado:est=>changeEstado(o.id,est)});
  const tabs=["pedidos","historial","usuarios"].filter(t=>t!=="usuarios"||user.role==="admin");

  const selInp = {padding:"7px 12px",borderRadius:8,border:`0.5px solid ${T.borderM}`,fontSize:13,background:T.surface,color:T.t1,cursor:"pointer"};

  return (
    <div style={{minHeight:"100vh",background:T.bg,fontFamily:"'Inter',system-ui,sans-serif"}}>
      {toast&&<Toast {...toast}/>}

      {/* ── Topbar ──────────────────────────────────────────────────────── */}
      <div style={{background:T.surface,borderBottom:`0.5px solid ${T.border}`,padding:"0 1.5rem",display:"flex",alignItems:"center",justifyContent:"space-between",height:52,position:"sticky",top:0,zIndex:40}}>
        <div style={{display:"flex",alignItems:"center",gap:20}}>
          {/* Logo */}
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{width:28,height:28,borderRadius:8,background:"#185FA5",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="2"><path d="M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/></svg>
            </div>
            <span style={{fontSize:14,fontWeight:500,color:T.t1}}>Portal de pedidos</span>
          </div>
          {/* Tabs */}
          <div style={{display:"flex",gap:2}}>
            {tabs.map(t=>(
              <button key={t} onClick={()=>setTab(t)} style={{fontSize:13,padding:"5px 14px",borderRadius:8,border:"none",cursor:"pointer",background:tab===t?"#E6F1FB":"transparent",color:tab===t?"#0C447C":T.t2,fontWeight:tab===t?500:400,transition:"background .15s"}}>
                {t.charAt(0).toUpperCase()+t.slice(1)}
              </button>
            ))}
          </div>
        </div>
        {/* Usuario */}
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <Avatar name={user.name} role={user.role} size={28}/>
          <span style={{fontSize:12,color:T.t2}}>{user.name}</span>
          <RoleBadge role={user.role}/>
          <DarkToggle dark={dark} onToggle={()=>setDark(d=>!d)} T={T}/>
          <button onClick={async()=>{await supabase.auth.signOut();setUser(null);setSelected(null);}} style={{fontSize:11,color:T.t2,background:"none",border:`0.5px solid ${T.border}`,borderRadius:6,padding:"4px 10px",cursor:"pointer"}}>Salir</button>
        </div>
      </div>

      {/* ── Main content ────────────────────────────────────────────────── */}
      <div style={{maxWidth:1100,margin:"0 auto",padding:"1.5rem 1rem"}}>

        {/* ── TAB: PEDIDOS ──────────────────────────────────────────────── */}
        {tab==="pedidos"&&<>
          {/* Filtros */}
          <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:16,alignItems:"center"}}>
            <div style={{flex:1,minWidth:200,position:"relative"}}>
              <div style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:T.t3,pointerEvents:"none"}}><SearchIcon/></div>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar pedido, producto, solicitante…" style={{...mkInp(T),paddingLeft:32}}/>
            </div>
            <select value={filterEstado} onChange={e=>setFilterEstado(e.target.value)} style={selInp}>
              <option>Todos</option>{ESTADOS.map(e=><option key={e}>{e}</option>)}
            </select>
            <select value={filterCat} onChange={e=>setFilterCat(e.target.value)} style={selInp}>
              <option>Todas</option>{CATEGORIAS.map(c=><option key={c}>{c}</option>)}
            </select>
            {(user.role==="empleado"||user.role==="admin")&&(
              <button onClick={()=>setShowForm(true)} style={mkBtnPrimary(T)}>+ Nuevo pedido</button>
            )}
          </div>

          {/* Métricas (admin / proveedor) */}
          {["admin","proveedor"].includes(user.role)&&(
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:8,marginBottom:16}}>
              {[
                {label:"Nuevos",      val:orders.filter(o=>o.estado==="Nuevo pedido").length,          bg:"#EEEDFE",text:"#3C3489"},
                {label:"En preparación",val:orders.filter(o=>o.estado==="En preparación").length,      bg:"#FAEEDA",text:"#633806"},
                {label:"En tránsito", val:orders.filter(o=>o.estado==="Enviado / en tránsito").length, bg:"#E6F1FB",text:"#0C447C"},
                {label:"Entregados",  val:orders.filter(o=>o.estado==="Entregado").length,             bg:"#EAF3DE",text:"#27500A"},
              ].map(s=><MetricCard key={s.label} {...s} T={T}/>)}
            </div>
          )}

          {/* Lista */}
          {loading ? <Spinner T={T}/> : <>
            {visible.length===0&&<div style={{textAlign:"center",padding:"4rem",color:T.t3,fontSize:14}}>No hay pedidos que mostrar</div>}

            {nuevos.length>0&&(
              <div style={{marginBottom:20}}>
                <SectionHead s={SECTION.nuevos} count={nuevos.length} collapsed={collapsed.nuevos} onToggle={()=>toggle("nuevos")} pulsing/>
                {!collapsed.nuevos&&<div style={{display:"flex",flexDirection:"column",gap:8}}>{nuevos.map((o,i)=><OrderRow key={o.id} {...rp(o,i,true)}/>)}</div>}
              </div>
            )}
            {enCurso.length>0&&(
              <div style={{marginBottom:20}}>
                <SectionHead s={SECTION.curso} count={enCurso.length} collapsed={collapsed.curso} onToggle={()=>toggle("curso")} pulsing={false}/>
                {!collapsed.curso&&<div style={{display:"flex",flexDirection:"column",gap:8}}>{enCurso.map((o,i)=><OrderRow key={o.id} {...rp(o,i,false,{light:"#E1F5EE",dark:"#D0EDE0",border:"#9FE1CB"})}/>)}</div>}
              </div>
            )}
            {finalizados.length>0&&(
              <div>
                <SectionHead s={SECTION.finalizados} count={finalizados.length} collapsed={collapsed.finalizados} onToggle={()=>toggle("finalizados")} pulsing={false}/>
                {!collapsed.finalizados&&<div style={{display:"flex",flexDirection:"column",gap:8,opacity:.65,filter:"saturate(.6)"}}>{finalizados.map((o,i)=><OrderRow key={o.id} {...rp(o,i,false,{light:"#FAECE7",dark:"#F5C4B3",border:"#F0997B"})}/>)}</div>}
              </div>
            )}
          </>}
        </>}

        {/* ── TAB: HISTORIAL ────────────────────────────────────────────── */}
        {tab==="historial"&&(
          <div>
            <div style={{display:"flex",gap:10,marginBottom:16,alignItems:"center",flexWrap:"wrap"}}>
              <div style={{flex:1,minWidth:180,position:"relative"}}>
                <div style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:T.t3,pointerEvents:"none"}}><SearchIcon/></div>
                <input value={histSearch} onChange={e=>setHistSearch(e.target.value)} placeholder="Buscar por pedido, usuario, estado…" style={{...mkInp(T),paddingLeft:32}}/>
              </div>
              <span style={{fontSize:12,color:T.t3,whiteSpace:"nowrap"}}>{visibleHist.length} entradas</span>
            </div>
            <div style={{display:"flex",gap:6,marginBottom:16,flexWrap:"wrap"}}>
              {[
                {label:"↓ XLSX (vista)",   fn:()=>exportXLSX(visibleHist,"historial-filtrado"),  bg:"#EAF3DE",color:"#27500A",border:"#C0DD97"},
                {label:"↓ PDF (vista)",    fn:()=>exportPDF(visibleHist,"historial-filtrado"),   bg:"#FCEBEB",color:"#791F1F",border:"#F09595"},
                {label:"↓ XLSX (todo)",    fn:()=>exportXLSX(historial,"historial-completo"),    bg:"#EEEDFE",color:"#3C3489",border:"#AFA9EC"},
                {label:"↓ PDF (todo)",     fn:()=>exportPDF(historial,"historial-completo"),     bg:"#FAEEDA",color:"#633806",border:"#FAC775"},
              ].map(b=>(
                <button key={b.label} onClick={b.fn} style={{fontSize:12,padding:"6px 14px",borderRadius:8,border:`0.5px solid ${b.border}`,background:b.bg,color:b.color,cursor:"pointer",fontWeight:500}}>{b.label}</button>
              ))}
            </div>
            {visibleHist.length===0
              ? <div style={{textAlign:"center",padding:"4rem",color:T.t3,fontSize:14}}>No hay movimientos registrados</div>
              : <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {visibleHist.map((h,i)=>{
                    const r=ROLES[h.usuario_role]||ROLES.empleado;
                    const cOld=ECOLOR[h.estado_anterior]||{bg:"#F1EFE8",text:"#444441"};
                    const cNew=ECOLOR[h.estado_nuevo]||{bg:"#F1EFE8",text:"#444441"};
                    return (
                      <div key={h.id} style={{background:i%2===0?T.surface:T.surf2,border:`0.5px solid ${T.border}`,borderRadius:10,padding:"11px 16px",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
                        <div style={{fontSize:11,color:T.t3,minWidth:116,flexShrink:0,fontFamily:"monospace"}}>{fmtDateTime(h.created_at)}</div>
                        <div style={{display:"flex",alignItems:"center",gap:7,minWidth:130,flexShrink:0}}>
                          <Avatar name={h.usuario_nombre} role={h.usuario_role} size={24}/>
                          <div>
                            <div style={{fontSize:12,fontWeight:500,color:T.t1}}>{h.usuario_nombre}</div>
                            <span style={{background:r.bg,color:r.text,fontSize:9,fontWeight:500,padding:"1px 6px",borderRadius:20}}>{r.label}</span>
                          </div>
                        </div>
                        <div style={{fontSize:11,fontWeight:500,color:T.t2,minWidth:72,flexShrink:0,fontFamily:"monospace"}}>{h.pedido_id}</div>
                        <div style={{display:"flex",alignItems:"center",gap:6,flex:1,flexWrap:"wrap"}}>
                          {h.estado_anterior?<span style={{background:cOld.bg,color:cOld.text,fontSize:11,fontWeight:500,padding:"2px 8px",borderRadius:20}}>{h.estado_anterior}</span>:<span style={{fontSize:11,color:T.t3}}>—</span>}
                          <span style={{fontSize:11,color:T.t3}}>→</span>
                          <span style={{background:cNew.bg,color:cNew.text,fontSize:11,fontWeight:500,padding:"2px 8px",borderRadius:20}}>{h.estado_nuevo}</span>
                        </div>
                        {h.notas&&<div style={{fontSize:11,color:T.t3,fontStyle:"italic",minWidth:100}}>{h.notas}</div>}
                      </div>
                    );
                  })}
                </div>}
          </div>
        )}

        {/* ── TAB: USUARIOS ─────────────────────────────────────────────── */}
        {tab==="usuarios"&&user.role==="admin"&&(
          <UsersPanel users={users} currentUser={user} T={T} onNew={()=>setUserModal("new")} onEdit={u=>setUserModal(u)} onDelete={deleteUser}/>
        )}
      </div>

      {/* ── Overlays ────────────────────────────────────────────────────── */}
      {selected&&<DetailPanel order={selected} user={user} T={T} onClose={()=>setSelected(null)} onUpdate={async ch=>{await updateOrder(selected.id,ch);showToast("Pedido actualizado");}} onDelete={()=>deleteOrder(selected.id)} onChangeEstado={est=>changeEstado(selected.id,est)}/>}
      {showForm&&<NewOrderModal user={user} T={T} onClose={()=>setShowForm(false)} onCreate={async data=>{await createOrder(data);setShowForm(false);}}/>}
      {userModal&&<UserModal userData={userModal==="new"?null:userModal} T={T} onSave={saveUser} onClose={()=>setUserModal(null)}/>}
    </div>
  );
}
