import { useState, useMemo, useEffect, useCallback } from "react";
import { supabase } from "./supabase";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import "jspdf-autotable";

/* ─── Paleta corporativa verde oliva ─────────────────────────────────────── */
const OL = {
  50:  "#F2F4EE",
  100: "#DDE3D0",
  200: "#C3CEAF",
  400: "#8FA870",
  600: "#5E7A40",
  800: "#3A5226",
  900: "#243318",
};

/* ─── Constantes ─────────────────────────────────────────────────────────── */
const ROLES = {
  empleado:    { label:"Empleado",      bg:OL[50],    text:OL[800] },
  responsable: { label:"Responsable",   bg:"#E1F5EE", text:"#085041" },
  proveedor:   { label:"Proveedor",     bg:"#FAEEDA", text:"#633806" },
  admin:       { label:"Administrador", bg:"#EEEDFE", text:"#3C3489" },
};
const CATEGORIAS = ["Ordenador","Periférico","Teléfono","Tablet","Accesorio","Otro"];
const ESTADOS_PROVEEDOR_POST = ["Albarán enviado","Facturado","Pendiente de pago","Pagado","En garantía / incidencia","Solucionado"];
const ESTADOS = ["Nuevo pedido","En preparación","Enviado / en tránsito","Entregado","Albarán enviado","Facturado","Pendiente de pago","Pagado","En garantía / incidencia","Solucionado","Cancelado"];
const ECOLOR = {
  "Nuevo pedido":             { bg:OL[50],    text:OL[800], btn:OL[200] },
  "En preparación":           { bg:"#FAEEDA", text:"#633806", btn:"#FAC775" },
  "Enviado / en tránsito":    { bg:OL[100],   text:OL[800],  btn:OL[400] },
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
  nuevos:      { label:"Nuevos pedidos pendientes", bg:OL[50],    border:OL[200],   dot:OL[600],    text:OL[800],   cBg:OL[800],   cText:OL[50],    pulse:true  },
  curso:       { label:"Pedidos en curso",          bg:"#E1F5EE", border:"#9FE1CB", dot:"#1D9E75",  text:"#085041", cBg:"#085041", cText:"#E1F5EE", pulse:false },
  finalizados: { label:"Finalizados y cancelados",  bg:"#FAECE7", border:"#F0997B", dot:"#D85A30",  text:"#712B13", cBg:"#712B13", cText:"#FAECE7", pulse:false },
};

/* ─── Utilidades ─────────────────────────────────────────────────────────── */
const fmtDate     = ()   => { const d=new Date(); return `${String(d.getDate()).padStart(2,"0")}-${String(d.getMonth()+1).padStart(2,"0")}-${d.getFullYear()}`; };
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

/* ─── Tokens por modo ────────────────────────────────────────────────────── */
const makeT = (dark) => ({
  bg:        dark ? "#13140f" : "#f2f4ee",
  surface:   dark ? "#1a1d14" : "#ffffff",
  surf2:     dark ? "#22261a" : "#f2f4ee",
  t1:        dark ? "#e6e8df" : "#1a1a14",
  t2:        dark ? "#9a9d8e" : "#5e6354",
  t3:        dark ? "#5a5e50" : "#9a9d8e",
  border:    dark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.08)",
  borderM:   dark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.13)",
  sidebarBg: dark ? "#161910" : "#ffffff",
});

/* ─── Átomos ─────────────────────────────────────────────────────────────── */
const Pill = ({estado}) => {
  const c=ECOLOR[estado]||{bg:"#F1EFE8",text:"#444441"};
  return <span style={{background:c.bg,color:c.text,fontSize:11,fontWeight:500,padding:"3px 10px",borderRadius:20,whiteSpace:"nowrap",display:"inline-block"}}>{estado}</span>;
};
const Avatar = ({name,role,size=32}) => {
  const r=ROLES[role]||ROLES.empleado;
  const ini=name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
  return <div style={{width:size,height:size,borderRadius:"50%",background:r.bg,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*0.34,fontWeight:500,color:r.text}}>{ini}</div>;
};
const RoleBadge = ({role}) => {
  const r=ROLES[role]||ROLES.empleado;
  return <span style={{background:r.bg,color:r.text,fontSize:10,fontWeight:500,padding:"2px 8px",borderRadius:20}}>{r.label}</span>;
};
const Toast = ({msg,type}) => (
  <div style={{position:"fixed",top:16,right:16,zIndex:9999,background:type==="ok"?OL[50]:"#FCEBEB",color:type==="ok"?OL[800]:"#791F1F",padding:"10px 18px",borderRadius:10,fontSize:13,fontWeight:500,border:`0.5px solid ${type==="ok"?OL[200]:"#F09595"}`,display:"flex",alignItems:"center",gap:8}}>
    <span style={{width:7,height:7,borderRadius:"50%",background:type==="ok"?OL[600]:"#E24B4A",display:"inline-block",flexShrink:0}}></span>
    {msg}
  </div>
);
const DarkToggle = ({dark,onToggle,T}) => (
  <button onClick={onToggle} style={{width:32,height:32,borderRadius:"50%",border:`0.5px solid ${T.border}`,background:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:T.t2,padding:0,flexShrink:0}}>
    {dark
      ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
      : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>}
  </button>
);
const Spinner = ({T}) => (
  <div style={{display:"flex",alignItems:"center",justifyContent:"center",padding:"4rem",color:T.t3,fontSize:13,gap:10}}>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{animation:"spin 1s linear infinite"}}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4"/>
    </svg>
    Cargando…
  </div>
);
const SearchIcon = () => <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="6.5" cy="6.5" r="4.5"/><path d="M10.5 10.5L14 14"/></svg>;
const PulseBar = () => (
  <>
    <style>{`@keyframes bPulse{0%,100%{opacity:1;width:5px}50%{opacity:.7;width:8px}}`}</style>
    <div style={{position:"absolute",left:0,top:0,bottom:0,width:5,borderRadius:"10px 0 0 10px",background:OL[600],animation:"bPulse 1.2s ease-in-out infinite"}}/>
  </>
);

/* ─── Botones ────────────────────────────────────────────────────────────── */
const mkBtnPrimary = () => ({background:OL[600],color:"#fff",border:"none",borderRadius:8,padding:"7px 16px",fontSize:13,fontWeight:500,cursor:"pointer"});
const mkBtnGhost   = (T) => ({background:"transparent",border:`0.5px solid ${T.border}`,borderRadius:8,padding:"7px 14px",fontSize:13,cursor:"pointer",color:T.t2});
const mkBtnDanger  = ()  => ({background:"transparent",border:"0.5px solid #F09595",borderRadius:8,padding:"7px 14px",fontSize:13,cursor:"pointer",color:"#791F1F"});
const mkInp        = (T) => ({padding:"8px 10px",borderRadius:8,border:`0.5px solid ${T.borderM}`,fontSize:13,background:T.surface,color:T.t1,width:"100%",outline:"none"});

/* ─── SectionHead ────────────────────────────────────────────────────────── */
function SectionHead({s,count,collapsed,onToggle,pulsing}) {
  return (
    <>
      {pulsing && <style>{`@keyframes hPulse{0%,100%{opacity:1}50%{opacity:.75}}`}</style>}
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

/* ─── Sidebar ────────────────────────────────────────────────────────────── */
function Sidebar({user,tab,onTab,pendingCount,T}) {
  const navItem = (key,label,iconPaths,badge=null) => {
    const active = tab===key;
    return (
      <div onClick={()=>onTab(key)}
        style={{display:"flex",alignItems:"center",gap:9,padding:"8px 14px",fontSize:13,color:active?OL[800]:T.t2,cursor:"pointer",background:active?OL[50]:"transparent",borderLeft:active?`2px solid ${OL[600]}`:"2px solid transparent",fontWeight:active?500:400,transition:"background .1s"}}>
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" style={{flexShrink:0,opacity:active?1:.55}}>
          {iconPaths}
        </svg>
        <span style={{flex:1}}>{label}</span>
        {badge!=null&&badge>0&&<span style={{fontSize:10,fontWeight:500,padding:"1px 7px",borderRadius:10,background:"#FCEBEB",color:"#791F1F"}}>{badge}</span>}
      </div>
    );
  };
  return (
    <div style={{width:200,flexShrink:0,background:T.sidebarBg,borderRight:`0.5px solid ${T.border}`,display:"flex",flexDirection:"column",minHeight:"100vh",position:"sticky",top:0}}>
      <div style={{padding:"14px 16px",borderBottom:`0.5px solid ${T.border}`,display:"flex",alignItems:"center",gap:10}}>
        <div style={{width:30,height:30,borderRadius:8,background:OL[600],display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.9)" strokeWidth="2">
            <path d="M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z"/>
            <path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/>
          </svg>
        </div>
        <div>
          <div style={{fontSize:13,fontWeight:500,color:T.t1}}>PedidosTech</div>
          <div style={{fontSize:10,color:T.t3}}>{ROLES[user.role]?.label}</div>
        </div>
      </div>
      <div style={{padding:"8px 0",flex:1}}>
        {navItem("inicio","Inicio",<><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/></>)}
        {(user.role==="empleado"||user.role==="admin")&&navItem("nuevo","Nuevo pedido",<><circle cx="8" cy="8" r="6"/><line x1="8" y1="5" x2="8" y2="11"/><line x1="5" y1="8" x2="11" y2="8"/></>)}
        {navItem("pedidos","Mis pedidos",<><path d="M2 4h12M2 8h8M2 12h5"/></>,user.role==="proveedor"?pendingCount:null)}
        {navItem("historial","Historial",<><circle cx="8" cy="8" r="6"/><path d="M8 5v3.5l2 2"/></>)}
        {user.role==="admin"&&navItem("usuarios","Usuarios",<><circle cx="6" cy="5" r="3"/><path d="M1 14s1-5 5-5 5 5 5 5"/><path d="M13 7s1 0 2 1M15 10s0-3-2-3"/></>)}
      </div>
      <div style={{padding:"12px 14px",borderTop:`0.5px solid ${T.border}`}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <Avatar name={user.name} role={user.role} size={30}/>
          <div style={{minWidth:0}}>
            <div style={{fontSize:12,fontWeight:500,color:T.t1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{user.name}</div>
            <div style={{fontSize:10,color:T.t3}}>{ROLES[user.role]?.label}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Dashboard ──────────────────────────────────────────────────────────── */
function Dashboard({user,orders,T}) {
  const myOrders   = orders.filter(o=>o.solicitante===user.name);
  const activos    = myOrders.filter(o=>!["Entregado","Cancelado",...ESTADOS_PROVEEDOR_POST].includes(o.estado));
  const enTransito = myOrders.filter(o=>o.estado==="Enviado / en tránsito");
  const entregados = myOrders.filter(o=>o.estado==="Entregado");
  const urgentes   = myOrders.filter(o=>o.estado==="En garantía / incidencia");

  const MetCard = ({label,val,sub,color}) => (
    <div style={{background:T.surface,border:`0.5px solid ${T.border}`,borderRadius:10,padding:"12px 14px"}}>
      <div style={{fontSize:11,color:T.t3,marginBottom:4,fontWeight:500}}>{label}</div>
      <div style={{fontSize:22,fontWeight:500,color:color||T.t1,lineHeight:1}}>{val}</div>
      {sub&&<div style={{fontSize:11,color:T.t3,marginTop:3}}>{sub}</div>}
    </div>
  );
  const AlertCard = ({bg,border,iconColor,title,sub,icon}) => (
    <div style={{background:bg,border:`0.5px solid ${border}`,borderRadius:8,padding:"10px 12px",display:"flex",alignItems:"flex-start",gap:10}}>
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke={iconColor} strokeWidth="1.5" style={{flexShrink:0,marginTop:1}}>{icon}</svg>
      <div>
        <div style={{fontSize:12,fontWeight:500,color:iconColor}}>{title}</div>
        <div style={{fontSize:11,color:iconColor,opacity:.8,marginTop:1}}>{sub}</div>
      </div>
    </div>
  );
  const SL = ({children}) => <div style={{fontSize:11,fontWeight:500,color:T.t3,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:10}}>{children}</div>;
  const Card = ({children}) => <div style={{background:T.surface,border:`0.5px solid ${T.border}`,borderRadius:10,overflow:"hidden"}}>{children}</div>;
  const Row = ({o,last}) => (
    <div style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",borderBottom:last?0:`0.5px solid ${T.border}`}}>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:12,fontWeight:500,color:T.t1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{o.producto}</div>
        <div style={{fontSize:10,color:T.t3,fontFamily:"monospace"}}>{o.id}</div>
      </div>
      <Pill estado={o.estado}/>
    </div>
  );

  /* EMPLEADO */
  if (user.role==="empleado") {
    const gasto=myOrders.reduce((s,o)=>s+(o.precio||0)*(o.cantidad||1),0);
    const limite=7500;
    return (
      <div style={{padding:"18px 20px",display:"flex",flexDirection:"column",gap:16}}>
        <div><div style={{fontSize:15,fontWeight:500,color:T.t1,marginBottom:2}}>Buenos días, {user.name.split(" ")[0]}</div><div style={{fontSize:12,color:T.t3}}>Resumen de tus pedidos</div></div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:10}}>
          <MetCard label="Pedidos activos"     val={activos.length}    sub={urgentes.length>0?`${urgentes.length} con incidencia`:undefined} color={activos.length?T.t1:T.t3}/>
          <MetCard label="En tránsito"         val={enTransito.length} sub="Pendientes de recibir" color={enTransito.length?OL[600]:T.t3}/>
          <MetCard label="Entregados este mes" val={entregados.length} sub="Este mes"               color={entregados.length?"#27500A":T.t3}/>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)",gap:14}}>
          <div>
            <SL>Alertas y acciones</SL>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {urgentes.length>0
                ? urgentes.slice(0,2).map(o=><AlertCard key={o.id} bg="#FCEBEB" border="#F09595" iconColor="#791F1F" title={`${o.id} en incidencia`} sub={o.producto} icon={<><circle cx="8" cy="8" r="6"/><line x1="8" y1="5" x2="8" y2="8"/><circle cx="8" cy="11" r=".6" fill="#791F1F"/></>}/>)
                : null}
              {enTransito.slice(0,2).map(o=><AlertCard key={o.id} bg={OL[50]} border={OL[200]} iconColor={OL[800]} title={`${o.id} en tránsito`} sub={`${o.producto}${o.fechaEstimada?" — est. "+o.fechaEstimada:""}`} icon={<><path d="M8 2v8M4 7l4 4 4-4"/><path d="M2 13h12"/></>}/>)}
              {activos.filter(o=>!o.fechaEstimada).slice(0,1).map(o=><AlertCard key={o.id} bg="#FAEEDA" border="#FAC775" iconColor="#633806" title={`${o.id} sin fecha estimada`} sub={o.producto} icon={<><rect x="2" y="3" width="12" height="10" rx="1"/><path d="M5 3V1M11 3V1M2 7h12"/></>}/>)}
              {urgentes.length===0&&enTransito.length===0&&activos.filter(o=>!o.fechaEstimada).length===0&&<div style={{fontSize:12,color:T.t3,padding:"8px 0"}}>Sin alertas activas</div>}
            </div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <div>
              <SL>Mis pedidos recientes</SL>
              <Card>{myOrders.length>0?myOrders.slice(0,4).map((o,i)=><Row key={o.id} o={o} last={i===Math.min(myOrders.length,4)-1}/>):<div style={{padding:"14px 12px",fontSize:12,color:T.t3}}>Sin pedidos aún</div>}</Card>
            </div>
            <div>
              <SL>Gasto personal del mes</SL>
              <Card><div style={{padding:"12px 14px"}}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:6}}><span style={{color:T.t2}}>Comprometido</span><span style={{fontWeight:500,color:T.t1}}>€{gasto.toLocaleString("es-ES")}</span></div>
                <div style={{height:6,borderRadius:3,background:T.surf2,overflow:"hidden"}}><div style={{width:`${Math.min((gasto/limite)*100,100).toFixed(0)}%`,height:"100%",borderRadius:3,background:OL[600]}}/></div>
                <div style={{fontSize:10,color:T.t3,marginTop:4}}>{((gasto/limite)*100).toFixed(0)}% del límite (€{limite.toLocaleString("es-ES")})</div>
              </div></Card>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* RESPONSABLE */
  if (user.role==="responsable") {
    const pendAprov=orders.filter(o=>o.estado==="Nuevo pedido");
    const enCurso=orders.filter(o=>["En preparación","Enviado / en tránsito"].includes(o.estado));
    const gastoTotal=orders.reduce((s,o)=>s+(o.precio||0)*(o.cantidad||1),0);
    const limite=25000;
    return (
      <div style={{padding:"18px 20px",display:"flex",flexDirection:"column",gap:16}}>
        <div><div style={{fontSize:15,fontWeight:500,color:T.t1,marginBottom:2}}>Panel de responsable</div><div style={{fontSize:12,color:T.t3}}>Aprobaciones y estado del equipo</div></div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:10}}>
          <MetCard label="Pend. aprobación" val={pendAprov.length} sub={`${pendAprov.filter(o=>!o.fechaEstimada).length} sin fecha`} color={pendAprov.length?"#633806":T.t3}/>
          <MetCard label="En curso"         val={enCurso.length}   sub="Preparación o tránsito" color={OL[600]}/>
          <MetCard label="Gasto del mes"    val={`€${gastoTotal.toLocaleString("es-ES",{maximumFractionDigits:0})}`} sub={`${((gastoTotal/limite)*100).toFixed(0)}% del ppto.`}/>
          <MetCard label="Cancelados"       val={orders.filter(o=>o.estado==="Cancelado").length} sub="Este mes" color="#791F1F"/>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)",gap:14}}>
          <div>
            <SL>Aprobaciones pendientes</SL>
            {pendAprov.length===0
              ? <div style={{fontSize:12,color:T.t3,padding:"8px 0"}}>No hay pedidos pendientes</div>
              : <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {pendAprov.slice(0,3).map(o=>(
                    <div key={o.id} style={{background:T.surface,border:`0.5px solid ${T.border}`,borderRadius:10,padding:"10px 12px"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                        <div><div style={{fontSize:12,fontWeight:500,color:T.t1}}>{o.producto}</div><div style={{fontSize:10,color:T.t3}}>{o.solicitante} · {o.id}{o.precio?` · €${(o.precio*o.cantidad).toLocaleString("es-ES")}`:""}</div></div>
                        {!o.fechaEstimada&&<span style={{background:"#FAEEDA",color:"#633806",fontSize:10,fontWeight:500,padding:"2px 7px",borderRadius:20}}>Sin fecha</span>}
                      </div>
                      <div style={{display:"flex",gap:6}}>
                        <span style={{flex:1,fontSize:11,padding:"5px 0",borderRadius:7,border:`0.5px solid ${OL[200]}`,background:OL[50],color:OL[800],cursor:"pointer",fontWeight:500,textAlign:"center"}}>Aprobar</span>
                        <span style={{flex:1,fontSize:11,padding:"5px 0",borderRadius:7,border:"0.5px solid #F09595",background:"#FCEBEB",color:"#791F1F",cursor:"pointer",textAlign:"center"}}>Rechazar</span>
                      </div>
                    </div>
                  ))}
                  {pendAprov.length>3&&<div style={{fontSize:12,color:OL[600],cursor:"pointer",paddingTop:2}}>Ver {pendAprov.length-3} más →</div>}
                </div>}
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <div>
              <SL>Presupuesto del mes</SL>
              <Card><div style={{padding:"12px 14px"}}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:6}}><span style={{color:T.t2}}>€{gastoTotal.toLocaleString("es-ES",{maximumFractionDigits:0})} de €{limite.toLocaleString("es-ES")}</span><span style={{fontWeight:500,color:gastoTotal/limite>.8?"#791F1F":OL[800]}}>{((gastoTotal/limite)*100).toFixed(0)}%</span></div>
                <div style={{height:6,borderRadius:3,background:T.surf2,overflow:"hidden",marginBottom:12}}><div style={{width:`${Math.min((gastoTotal/limite)*100,100).toFixed(0)}%`,height:"100%",borderRadius:3,background:OL[600]}}/></div>
                {[["Infraestructura",gastoTotal*0.57],["Periféricos",gastoTotal*0.20],["Consumibles",gastoTotal*0.12]].map(([k,v])=>(
                  <div key={k} style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:4}}><span style={{color:T.t2}}>{k}</span><span style={{fontWeight:500,color:T.t1}}>€{v.toLocaleString("es-ES",{maximumFractionDigits:0})}</span></div>
                ))}
              </div></Card>
            </div>
            <div>
              <SL>Actividad reciente</SL>
              <Card>{orders.slice(0,4).map((o,i)=>(
                <div key={o.id} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 12px",borderBottom:i<3?`0.5px solid ${T.border}`:"none"}}>
                  <Avatar name={o.solicitante} role="empleado" size={22}/>
                  <div style={{flex:1,fontSize:11,color:T.t1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{o.solicitante} — {o.producto}</div>
                  <Pill estado={o.estado}/>
                </div>
              ))}</Card>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* PROVEEDOR */
  if (user.role==="proveedor") {
    const nuevos=orders.filter(o=>o.estado==="Nuevo pedido");
    const transito=orders.filter(o=>o.estado==="Enviado / en tránsito");
    const sinTracking=transito.filter(o=>!o.tracking);
    const factPend=orders.filter(o=>o.estado==="Albarán enviado");
    const importeFact=factPend.reduce((s,o)=>s+(o.precio||0)*(o.cantidad||1),0);
    const preparacion=orders.filter(o=>o.estado==="En preparación");
    return (
      <div style={{padding:"18px 20px",display:"flex",flexDirection:"column",gap:16}}>
        <div><div style={{fontSize:15,fontWeight:500,color:T.t1,marginBottom:2}}>Panel del proveedor</div><div style={{fontSize:12,color:T.t3}}>Pedidos pendientes y seguimiento</div></div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:10}}>
          <MetCard label="Nuevos por atender"  val={nuevos.length}      sub="Sin procesar"                                   color={nuevos.length?OL[800]:T.t3}/>
          <MetCard label="En preparación"      val={preparacion.length} sub="En proceso"                                      color={preparacion.length?"#633806":T.t3}/>
          <MetCard label="En tránsito"         val={transito.length}    sub={sinTracking.length>0?`${sinTracking.length} sin tracking`:"Todos con tracking"} color={transito.length?OL[600]:T.t3}/>
          <MetCard label="Facturas pendientes" val={factPend.length}    sub={`€${importeFact.toLocaleString("es-ES",{maximumFractionDigits:0})}`} color={factPend.length?"#791F1F":T.t3}/>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)",gap:14}}>
          <div>
            <SL>Nuevos pedidos por procesar</SL>
            {nuevos.length===0
              ? <div style={{fontSize:12,color:T.t3,padding:"8px 0"}}>Sin pedidos nuevos</div>
              : <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {nuevos.slice(0,3).map(o=>(
                    <div key={o.id} style={{background:T.surface,border:`1.5px solid ${OL[200]}`,borderRadius:10,padding:"10px 12px",position:"relative",overflow:"hidden"}}>
                      <div style={{position:"absolute",left:0,top:0,bottom:0,width:4,background:OL[600]}}/>
                      <div style={{paddingLeft:6}}>
                        <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:12,fontWeight:500,color:T.t1}}>{o.producto}</span></div>
                        <div style={{fontSize:11,color:T.t3}}>{o.id} · {o.solicitante}{o.fechaEstimada?` · Est. ${o.fechaEstimada}`:""}</div>
                        <span style={{display:"inline-block",marginTop:8,fontSize:11,padding:"4px 12px",borderRadius:7,border:`0.5px solid ${OL[200]}`,background:OL[50],color:OL[800],cursor:"pointer",fontWeight:500}}>→ Poner en preparación</span>
                      </div>
                    </div>
                  ))}
                  {nuevos.length>3&&<div style={{fontSize:12,color:OL[600],cursor:"pointer",paddingTop:2}}>Ver {nuevos.length-3} más →</div>}
                </div>}
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <div>
              <SL>Seguimiento activo</SL>
              <Card>{transito.length>0?transito.slice(0,3).map((o,i)=>(
                <div key={o.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",borderBottom:i<Math.min(transito.length,3)-1?`0.5px solid ${T.border}`:"none"}}>
                  <div style={{flex:1,minWidth:0}}><div style={{fontSize:12,fontWeight:500,color:T.t1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{o.producto}</div><div style={{fontSize:10,color:T.t3,fontFamily:"monospace"}}>{o.id}</div></div>
                  {o.tracking?<span style={{fontSize:11,color:OL[600],fontWeight:500}}>{o.tracking}</span>:<span style={{fontSize:11,color:"#791F1F",fontWeight:500}}>Sin tracking</span>}
                </div>
              )):<div style={{padding:"12px",fontSize:12,color:T.t3}}>Sin pedidos en tránsito</div>}</Card>
            </div>
            <div>
              <SL>Facturas pendientes</SL>
              <Card>{factPend.length>0?factPend.slice(0,3).map((o,i)=>(
                <div key={o.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",borderBottom:i<Math.min(factPend.length,3)-1?`0.5px solid ${T.border}`:"none"}}>
                  <div style={{flex:1}}><div style={{fontSize:12,fontWeight:500,color:T.t1}}>{o.id} · €{((o.precio||0)*(o.cantidad||1)).toLocaleString("es-ES")}</div><div style={{fontSize:10,color:T.t3}}>Albarán enviado</div></div>
                  <span style={{fontSize:11,padding:"3px 10px",borderRadius:7,border:`0.5px solid ${OL[200]}`,background:OL[50],color:OL[800],cursor:"pointer",fontWeight:500}}>Facturar</span>
                </div>
              )):<div style={{padding:"12px",fontSize:12,color:T.t3}}>Sin facturas pendientes</div>}</Card>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ADMIN */
  const actTot    = orders.filter(o=>!["Cancelado",...ESTADOS_PROVEEDOR_POST,"Pagado"].includes(o.estado));
  const pendAprov = orders.filter(o=>o.estado==="Nuevo pedido");
  const incids    = orders.filter(o=>o.estado==="En garantía / incidencia");
  const gastoTot  = orders.reduce((s,o)=>s+(o.precio||0)*(o.cantidad||1),0);
  const limite    = 25000;
  const estadoCounts = ESTADOS.map(e=>({e,n:orders.filter(o=>o.estado===e).length})).filter(x=>x.n>0);
  const maxN = Math.max(...estadoCounts.map(x=>x.n),1);
  return (
    <div style={{padding:"18px 20px",display:"flex",flexDirection:"column",gap:16}}>
      <div><div style={{fontSize:15,fontWeight:500,color:T.t1,marginBottom:2}}>Panel de administración</div><div style={{fontSize:12,color:T.t3}}>Vista global del sistema</div></div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:10}}>
        <MetCard label="Pedidos activos"      val={actTot.length}    sub="+3 esta semana"/>
        <MetCard label="Pend. aprobación"     val={pendAprov.length} sub={`${pendAprov.filter(o=>!o.fechaEstimada).length} sin fecha`} color={pendAprov.length?"#633806":T.t3}/>
        <MetCard label="Gasto del mes"        val={`€${gastoTot.toLocaleString("es-ES",{maximumFractionDigits:0})}`} sub={`${((gastoTot/limite)*100).toFixed(0)}% del ppto.`}/>
        <MetCard label="Incidencias abiertas" val={incids.length} sub="Sin resolver" color={incids.length?"#791F1F":T.t3}/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)",gap:14}}>
        <div>
          <SL>Alertas del sistema</SL>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {incids.length>0&&<AlertCard bg="#FCEBEB" border="#F09595" iconColor="#791F1F" title={`${incids.length} incidencia${incids.length>1?"s":""} sin resolver`} sub={incids.map(o=>o.id).join(", ")} icon={<><path d="M8 2L1 13h14L8 2z"/><line x1="8" y1="7" x2="8" y2="10"/><circle cx="8" cy="12" r=".6" fill="#791F1F"/></>}/>}
            {gastoTot/limite>.65&&<AlertCard bg="#FAEEDA" border="#FAC775" iconColor="#633806" title={`Presupuesto al ${((gastoTot/limite)*100).toFixed(0)}%`} sub={`Quedan €${(limite-gastoTot).toLocaleString("es-ES",{maximumFractionDigits:0})}`} icon={<><circle cx="8" cy="8" r="6"/><line x1="8" y1="5" x2="8" y2="8"/><circle cx="8" cy="11" r=".6" fill="#633806"/></>}/>}
            {pendAprov.length>0&&<AlertCard bg={OL[50]} border={OL[200]} iconColor={OL[800]} title={`${pendAprov.length} pedido${pendAprov.length>1?"s":""} esperan aprobación`} sub={`Más antiguo: ${pendAprov[pendAprov.length-1]?.fechaSolicitud||"—"}`} icon={<><circle cx="8" cy="8" r="6"/><line x1="8" y1="5" x2="8" y2="11"/><line x1="5" y1="8" x2="11" y2="8"/></>}/>}
            {orders.filter(o=>o.estado==="Enviado / en tránsito"&&!o.tracking).length>0&&<AlertCard bg="#FAEEDA" border="#FAC775" iconColor="#633806" title="Pedidos en tránsito sin tracking" sub={orders.filter(o=>o.estado==="Enviado / en tránsito"&&!o.tracking).map(o=>o.id).join(", ")} icon={<><path d="M8 2v8M4 7l4 4 4-4"/><path d="M2 13h12"/></>}/>}
            {incids.length===0&&gastoTot/limite<=.65&&pendAprov.length===0&&<div style={{fontSize:12,color:T.t3,padding:"8px 0"}}>Sin alertas activas</div>}
          </div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <div>
            <SL>Resumen por estado</SL>
            <Card><div style={{padding:"12px 14px"}}>
              {estadoCounts.map(({e,n})=>{
                const c=ECOLOR[e]||{bg:"#F1EFE8",text:"#444441"};
                return (
                  <div key={e} style={{display:"flex",alignItems:"center",gap:8,marginBottom:7}}>
                    <span style={{background:c.bg,color:c.text,fontSize:10,fontWeight:500,padding:"2px 7px",borderRadius:20,whiteSpace:"nowrap",minWidth:110,display:"inline-block",textAlign:"center"}}>{e}</span>
                    <div style={{flex:1,height:5,borderRadius:3,background:T.surf2,overflow:"hidden"}}><div style={{width:`${(n/maxN)*100}%`,height:"100%",borderRadius:3,background:c.text,opacity:.5}}/></div>
                    <span style={{fontSize:11,fontWeight:500,color:T.t1,minWidth:14,textAlign:"right"}}>{n}</span>
                  </div>
                );
              })}
              {estadoCounts.length===0&&<div style={{fontSize:12,color:T.t3}}>Sin datos</div>}
            </div></Card>
          </div>
          <div>
            <SL>Últimos movimientos</SL>
            <Card>{orders.slice(0,4).map((o,i)=>(
              <div key={o.id} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 12px",borderBottom:i<3?`0.5px solid ${T.border}`:"none"}}>
                <Avatar name={o.solicitante} role="empleado" size={22}/>
                <div style={{flex:1,minWidth:0,fontSize:11,color:T.t1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{o.solicitante} — {o.producto}</div>
                <Pill estado={o.estado}/>
              </div>
            ))}{orders.length===0&&<div style={{padding:"12px",fontSize:12,color:T.t3}}>Sin pedidos</div>}</Card>
          </div>
        </div>
      </div>
    </div>
  );
}

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
              <button key={s} onClick={()=>{onSelect(s);onClose();}}
                style={{width:"100%",padding:"12px 16px",borderRadius:10,border:`1px solid ${c.btn}`,background:c.bg,color:c.text,fontSize:14,fontWeight:500,cursor:"pointer",display:"flex",alignItems:"center",gap:10,transition:"transform .1s"}}
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
  if(highlight){bg=idx%2===0?OL[50]:OL[100];border=`1.5px solid ${OL[400]}`;}
  else if(groupColors){bg=idx%2===0?groupColors.light:groupColors.dark;border=`0.5px solid ${groupColors.border}`;}
  else{bg=idx%2===0?T.surface:T.surf2;border=`0.5px solid ${T.border}`;}
  return (
    <>
      {showEstado&&<EstadoModal order={o} next={next} T={T} onSelect={onChangeEstado} onClose={()=>setShowEstado(false)}/>}
      <div onClick={e=>{if(e.target.tagName==="BUTTON")return;if(next.length>0)setShowEstado(true);else onSelect();}}
        style={{background:bg,border,borderRadius:10,padding:"12px 16px",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap",position:"relative",overflow:"hidden",cursor:"pointer",transition:"box-shadow .15s"}}
        onMouseEnter={e=>e.currentTarget.style.boxShadow="0 2px 10px rgba(0,0,0,0.05)"}
        onMouseLeave={e=>e.currentTarget.style.boxShadow="none"}>
        {highlight&&<PulseBar/>}
        <div style={{width:74,fontSize:11,fontWeight:500,color:T.t3,fontFamily:"monospace",flexShrink:0}}>{o.id}</div>
        <div style={{flex:1,minWidth:140}}>
          <div style={{fontSize:13,fontWeight:500,color:highlight?OL[800]:T.t1,marginBottom:1}}>{o.producto}</div>
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
          {o.estado==="Entregado"&&o.fechaEntrega?<span style={{color:"#27500A",fontWeight:500}}>Entregado {o.fechaEntrega}</span>:o.fechaEstimada?`Est. ${o.fechaEstimada}`:"—"}
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
  const FL = ({children}) => <div style={{fontSize:11,color:T.t3,marginBottom:4,fontWeight:500,textTransform:"uppercase",letterSpacing:"0.04em"}}>{children}</div>;
  const Field=({label,k,type="text",opts=null})=>(
    <div style={{marginBottom:14}}>
      <FL>{label}</FL>
      {editable(k)
        ? opts?<select value={form[k]||""} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} style={inp}>{opts.map(v=><option key={v}>{v}</option>)}</select>
          :type==="textarea"?<textarea value={form[k]||""} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} rows={3} style={{...inp,resize:"vertical",height:"auto"}}/>
          :<input type={type} value={form[k]||""} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} style={inp}/>
        :<div style={{fontSize:13,color:T.t1,paddingTop:2}}>{form[k]||<span style={{color:T.t3}}>—</span>}</div>}
    </div>
  );
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.2)",zIndex:100,display:"flex",justifyContent:"flex-end"}} onClick={onClose}>
      <div style={{width:"100%",maxWidth:480,background:T.surface,height:"100%",overflowY:"auto",padding:"1.5rem",display:"flex",flexDirection:"column",gap:14,borderLeft:`0.5px solid ${T.borderM}`}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div>
            <div style={{fontSize:11,color:T.t3,marginBottom:3,fontFamily:"monospace"}}>{o.id}</div>
            <div style={{fontSize:15,fontWeight:500,color:T.t1,lineHeight:1.3}}>{o.producto}</div>
            <div style={{fontSize:11,color:T.t3,marginTop:3}}>Solicitado el {o.fechaSolicitud}</div>
          </div>
          <button onClick={onClose} style={{background:"none",border:`0.5px solid ${T.border}`,borderRadius:"50%",width:30,height:30,cursor:"pointer",color:T.t2,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:14}}>✕</button>
        </div>
        <Pill estado={o.estado}/>
        {next.length>0&&(
          <div>
            <div style={{fontSize:11,color:T.t3,marginBottom:8,textTransform:"uppercase",letterSpacing:"0.04em",fontWeight:500}}>Cambiar estado</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {next.map(s=>{const c=ECOLOR[s];return <button key={s} onClick={()=>{onChangeEstado(s);setForm(f=>({...f,estado:s}));}} style={{fontSize:12,padding:"5px 12px",borderRadius:20,border:`1px solid ${c.btn}`,background:c.bg,color:c.text,cursor:"pointer",fontWeight:500}}>→ {s}</button>;})}
            </div>
          </div>
        )}
        <div style={{height:"0.5px",background:T.border}}/>
        <Field label="Producto" k="producto"/>
        <Field label="Categoría" k="categoria" opts={CATEGORIAS}/>
        <Field label="Cantidad" k="cantidad" type="number"/>
        <Field label="Precio unitario (€)" k="precio" type="number"/>
        {form.precio>0&&<div style={{marginBottom:14,background:OL[50],borderRadius:8,padding:"10px 14px"}}><div style={{fontSize:11,color:OL[800],marginBottom:2,fontWeight:500}}>Importe total</div><div style={{fontSize:16,fontWeight:500,color:OL[800]}}>€{(form.precio*form.cantidad).toLocaleString("es-ES")}</div></div>}
        <Field label="Solicitante" k="solicitante"/>
        <Field label="Fecha estimada" k="fechaEstimada" type="date"/>
        <Field label="Nº seguimiento / albarán" k="tracking"/>
        <Field label="Notas" k="notas" type="textarea"/>
        {["En garantía / incidencia","Solucionado"].includes(form.estado)&&(
          <div style={{marginBottom:14}}>
            <FL>Notas de incidencia</FL>
            {editing?<textarea value={form.notasIncidencia||""} onChange={e=>setForm(f=>({...f,notasIncidencia:e.target.value}))} rows={4} placeholder="Describe el problema…" style={{...inp,resize:"vertical",height:"auto",border:"1px solid #F09595",background:"#FCEBEB"}}/>
            :<div style={{fontSize:13,color:"#791F1F",background:"#FCEBEB",borderRadius:8,padding:"10px 12px",border:"0.5px solid #F09595",minHeight:60,whiteSpace:"pre-wrap"}}>{form.notasIncidencia||<span style={{opacity:.5}}>Sin notas</span>}</div>}
          </div>
        )}
        <div style={{display:"flex",gap:8,marginTop:"auto",paddingTop:16,borderTop:`0.5px solid ${T.border}`}}>
          {canEdit&&!editing&&<button onClick={()=>setEditing(true)} style={mkBtnPrimary()}>Editar</button>}
          {editing&&<button onClick={save} style={mkBtnPrimary()}>Guardar</button>}
          {editing&&<button onClick={()=>{setForm({...o});setEditing(false);}} style={mkBtnGhost(T)}>Cancelar</button>}
          {user.role==="admin"&&!editing&&<button onClick={onDelete} style={mkBtnDanger()}>Eliminar</button>}
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
  const FL=({children})=><div style={{fontSize:11,color:T.t3,marginBottom:4,fontWeight:500,textTransform:"uppercase",letterSpacing:"0.04em"}}>{children}</div>;
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.35)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={onClose}>
      <div style={{background:T.surface,borderRadius:14,padding:"1.75rem",width:"100%",maxWidth:460,maxHeight:"90vh",overflowY:"auto",border:`0.5px solid ${T.borderM}`}} onClick={e=>e.stopPropagation()}>
        <div style={{fontSize:16,fontWeight:500,color:T.t1,marginBottom:20}}>Nuevo pedido</div>
        <div style={{marginBottom:14}}><FL>Producto</FL><input value={form.producto} onChange={e=>f("producto",e.target.value)} placeholder='Ej. MacBook Pro 14"' style={inp}/></div>
        <div style={{marginBottom:14}}><FL>Categoría</FL><select value={form.categoria} onChange={e=>f("categoria",e.target.value)} style={inp}>{CATEGORIAS.map(c=><option key={c}>{c}</option>)}</select></div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
          <div><FL>Cantidad</FL><input type="number" min={1} value={form.cantidad} onChange={e=>f("cantidad",+e.target.value)} style={inp}/></div>
          <div><FL>Precio (€) · opcional</FL><input type="number" min={0} value={form.precio} placeholder="—" onChange={e=>f("precio",+e.target.value)} style={inp}/></div>
        </div>
        <div style={{marginBottom:14}}><FL>Fecha estimada</FL><input type="date" value={form.fechaEstimada} onChange={e=>f("fechaEstimada",e.target.value)} style={inp}/></div>
        <div style={{marginBottom:20}}><FL>Notas</FL><textarea value={form.notas} onChange={e=>f("notas",e.target.value)} rows={3} style={{...inp,resize:"vertical",height:"auto"}}/></div>
        {form.precio>0&&form.cantidad>0&&<div style={{background:OL[50],borderRadius:8,padding:"10px 14px",marginBottom:16}}><span style={{fontSize:12,color:OL[800]}}>Importe total: </span><span style={{fontSize:14,fontWeight:500,color:OL[800]}}>€{(form.precio*form.cantidad).toLocaleString("es-ES")}</span></div>}
        <div style={{display:"flex",gap:8}}>
          <button disabled={!valid||saving} onClick={handle} style={{...mkBtnPrimary(),opacity:valid&&!saving?1:.5,cursor:valid&&!saving?"pointer":"not-allowed"}}>{saving?"Guardando…":"Crear pedido"}</button>
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
        <div style={{flex:1,position:"relative"}}><div style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:T.t3,pointerEvents:"none"}}><SearchIcon/></div><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar usuario…" style={{...inp,paddingLeft:32}}/></div>
        <button onClick={onNew} style={mkBtnPrimary()}>+ Nuevo usuario</button>
      </div>
      <div style={{background:"#FAEEDA",border:"0.5px solid #FAC775",borderRadius:10,padding:"10px 14px",marginBottom:16,fontSize:12,color:"#633806"}}>Para crear usuarios nuevos ve a <strong>Supabase → SQL Editor</strong> y ejecuta los comandos proporcionados.</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:10}}>
        {visible.map(u=>{
          const isSelf=u.id===currentUser.id;
          return (
            <div key={u.id} style={{background:T.surface,border:`0.5px solid ${T.border}`,borderRadius:12,padding:"16px"}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
                <Avatar name={u.name} role={u.role} size={40}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:500,color:T.t1,display:"flex",alignItems:"center",gap:6,marginBottom:2}}>{u.name}{isSelf&&<span style={{fontSize:10,background:OL[50],color:OL[800],padding:"1px 6px",borderRadius:20}}>tú</span>}</div>
                  <div style={{fontSize:11,color:T.t3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{u.email}</div>
                </div>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <RoleBadge role={u.role}/>
                <div style={{display:"flex",gap:6}}>
                  <button onClick={()=>onEdit(u)} style={{fontSize:11,padding:"4px 10px",borderRadius:8,border:`0.5px solid ${T.border}`,background:T.surface,color:T.t1,cursor:"pointer"}}>Editar</button>
                  {!isSelf&&(confirmId===u.id
                    ?<div style={{display:"flex",gap:4,alignItems:"center"}}><span style={{fontSize:11,color:"#791F1F"}}>¿Seguro?</span><button onClick={()=>{onDelete(u.id);setConfirmId(null);}} style={{fontSize:11,padding:"3px 8px",borderRadius:8,border:"0.5px solid #F09595",background:"#FCEBEB",color:"#791F1F",cursor:"pointer"}}>Sí</button><button onClick={()=>setConfirmId(null)} style={{fontSize:11,padding:"3px 8px",borderRadius:8,border:`0.5px solid ${T.border}`,background:T.surface,color:T.t1,cursor:"pointer"}}>No</button></div>
                    :<button onClick={()=>setConfirmId(u.id)} style={{fontSize:11,padding:"4px 10px",borderRadius:8,border:"0.5px solid #F09595",background:"none",color:"#791F1F",cursor:"pointer"}}>Eliminar</button>
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
  const FL=({children})=><div style={{fontSize:11,color:T.t3,marginBottom:4,fontWeight:500,textTransform:"uppercase",letterSpacing:"0.04em"}}>{children}</div>;
  const handleSave=async()=>{if(!valid)return;setSaving(true);const data={...form};if(userData&&!form.password)data.password=userData.password;await onSave(data);setSaving(false);};
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.35)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={onClose}>
      <div style={{background:T.surface,borderRadius:14,padding:"1.75rem",width:"100%",maxWidth:440,maxHeight:"90vh",overflowY:"auto",border:`0.5px solid ${T.borderM}`}} onClick={e=>e.stopPropagation()}>
        <div style={{fontSize:16,fontWeight:500,color:T.t1,marginBottom:20}}>{userData?"Editar usuario":"Nuevo usuario"}</div>
        <div style={{marginBottom:14}}><FL>Nombre completo</FL><input value={form.name} onChange={e=>f("name",e.target.value)} placeholder="Nombre completo" style={inp}/></div>
        <div style={{marginBottom:14}}><FL>Email</FL><input type="email" value={form.email} onChange={e=>f("email",e.target.value)} placeholder="correo@empresa.com" style={inp}/></div>
        <div style={{marginBottom:14}}>
          <FL>Contraseña{userData&&<span style={{fontWeight:400,textTransform:"none"}}> · vacío para no cambiar</span>}</FL>
          <div style={{position:"relative"}}>
            <input type={showPwd?"text":"password"} value={form.password} onChange={e=>f("password",e.target.value)} placeholder={userData?"••••••••":"Nueva contraseña"} style={{...inp,paddingRight:40}}/>
            <button onClick={()=>setShowPwd(p=>!p)} style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",fontSize:14,color:T.t3}}>{showPwd?"🙈":"👁️"}</button>
          </div>
        </div>
        <div style={{marginBottom:20}}><FL>Rol</FL><select value={form.role} onChange={e=>f("role",e.target.value)} style={inp}>{Object.entries(ROLES).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select></div>
        {form.role&&<div style={{background:ROLES[form.role].bg,borderRadius:8,padding:"10px 14px",marginBottom:16,display:"flex",alignItems:"center",gap:8,border:`0.5px solid ${T.border}`}}><Avatar name={form.name||"?"} role={form.role} size={32}/><div><div style={{fontSize:13,fontWeight:500,color:ROLES[form.role].text}}>{form.name||"Nombre del usuario"}</div><div style={{fontSize:11,color:ROLES[form.role].text,opacity:.8}}>{ROLES[form.role].label}</div></div></div>}
        <div style={{display:"flex",gap:8}}>
          <button disabled={!valid||saving} onClick={handleSave} style={{...mkBtnPrimary(),opacity:valid&&!saving?1:.5,cursor:valid&&!saving?"pointer":"not-allowed"}}>{saving?"Guardando…":userData?"Guardar cambios":"Crear usuario"}</button>
          <button onClick={onClose} style={mkBtnGhost(T)}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

/* ─── LoginForm ──────────────────────────────────────────────────────────── */
function LoginForm({T,onLogin}) {
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [showPwd,setShowPwd]=useState(false);
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(false);
  const inp={...mkInp(T),padding:"11px 14px",fontSize:14};
  const handleLogin=async()=>{
    setLoading(true);setError("");
    const{data,error:e}=await supabase.auth.signInWithPassword({email,password});
    if(e){setError("Email o contraseña incorrectos");setLoading(false);return;}
    const{data:u}=await supabase.from("usuarios").select("*").eq("id",data.user.id).single();
    if(u) onLogin(u); else{setError("Usuario no encontrado");setLoading(false);}
  };
  return (
    <div>
      <div style={{marginBottom:14}}><div style={{fontSize:11,color:T.t3,marginBottom:6,fontWeight:500,letterSpacing:"0.04em",textTransform:"uppercase"}}>Email</div><input type="email" value={email} onChange={e=>{setEmail(e.target.value);setError("");}} placeholder="correo@empresa.com" style={inp} onKeyDown={e=>e.key==="Enter"&&handleLogin()}/></div>
      <div style={{marginBottom:6}}>
        <div style={{fontSize:11,color:T.t3,marginBottom:6,fontWeight:500,letterSpacing:"0.04em",textTransform:"uppercase"}}>Contraseña</div>
        <div style={{position:"relative"}}>
          <input type={showPwd?"text":"password"} value={password} onChange={e=>{setPassword(e.target.value);setError("");}} placeholder="••••••••" style={{...inp,paddingRight:44}} onKeyDown={e=>e.key==="Enter"&&handleLogin()}/>
          <button onClick={()=>setShowPwd(p=>!p)} style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",color:T.t3,display:"flex",alignItems:"center",padding:0}}>
            {showPwd?<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>}
          </button>
        </div>
      </div>
      {error&&<div style={{fontSize:12,color:"#791F1F",background:"#FCEBEB",padding:"8px 12px",borderRadius:8,marginTop:8,border:"0.5px solid #F09595"}}>{error}</div>}
      <div style={{marginBottom:20}}/>
      <button onClick={handleLogin} disabled={loading} style={{...mkBtnPrimary(),width:"100%",padding:"11px",borderRadius:10,fontSize:14,opacity:loading?.7:1}}>{loading?"Entrando…":"Entrar"}</button>
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
  const [tab,setTab]=useState("inicio");
  const [users,setUsers]=useState([]);
  const [selected,setSelected]=useState(null);
  const [showForm,setShowForm]=useState(false);
  const [filterEstado,setFilterEstado]=useState("Todos");
  const [filterCat,setFilterCat]=useState("Todas");
  const [search,setSearch]=useState("");
  const [histSearch,setHistSearch]=useState("");
  const [histSort,setHistSort]=useState("fecha_desc");   // fecha_desc | fecha_asc | pedido_asc | pedido_desc | estado_nuevo | usuario
  const [histFiltroEstado,setHistFiltroEstado]=useState("Todos");
  const [histFiltroUsuario,setHistFiltroUsuario]=useState("Todos");
  const [toast,setToast]=useState(null);
  const [userModal,setUserModal]=useState(null);
  const [collapsed,setCollapsed]=useState({nuevos:true,curso:true,finalizados:true});

  const T=makeT(dark);
  useEffect(()=>{localStorage.setItem("dark",JSON.stringify(dark));},[dark]);
  const showToast=(msg,type="ok")=>{setToast({msg,type});setTimeout(()=>setToast(null),3000);};
  const toggle=(key)=>setCollapsed(p=>({...p,[key]:!p[key]}));

  const loadOrders=useCallback(async()=>{
    setLoading(true);
    const{data}=await supabase.from("pedidos").select("*").order("created_at",{ascending:false});
    if(data) setOrders(data.map(o=>({id:o.id,producto:o.producto,categoria:o.categoria,cantidad:o.cantidad,precio:o.precio,solicitante:o.solicitante,estado:o.estado,fechaSolicitud:o.fecha_solicitud,fechaEstimada:o.fecha_estimada||"",fechaEntrega:o.fecha_entrega||"",tracking:o.tracking||"",notas:o.notas||"",notasIncidencia:o.notas_incidencia||""})));
    setLoading(false);
  },[]);
  const loadUsers=useCallback(async()=>{const{data}=await supabase.from("usuarios").select("*");if(data) setUsers(data);},[]);
  const loadHistorial=useCallback(async(cu)=>{
    let q=supabase.from("historial").select("*").order("created_at",{ascending:false});
    if(!["admin","proveedor"].includes(cu.role)){const myO=await supabase.from("pedidos").select("id").eq("solicitante",cu.name);const ids=(myO.data||[]).map(o=>o.id);if(ids.length===0){setHistorial([]);return;}q=q.in("pedido_id",ids);}
    const{data}=await q;if(data) setHistorial(data);
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

  const exportXLSX=(data,nombre)=>{const filas=data.map(h=>({"Fecha":fmtDateTime(h.created_at),"Pedido":h.pedido_id,"Usuario":h.usuario_nombre,"Rol":ROLES[h.usuario_role]?.label||h.usuario_role,"Estado anterior":h.estado_anterior||"—","Estado nuevo":h.estado_nuevo,"Notas":h.notas||""}));const ws=XLSX.utils.json_to_sheet(filas);const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"Historial");XLSX.writeFile(wb,`${nombre}.xlsx`);};
  const exportPDF=(data,nombre)=>{const doc=new jsPDF({orientation:"landscape"});doc.setFontSize(14);doc.text("Historial de pedidos",14,16);doc.setFontSize(9);doc.setTextColor(120);doc.text(`Exportado el ${fmtDateTime(new Date().toISOString())} · ${data.length} entradas`,14,22);doc.autoTable({startY:28,head:[["Fecha","Pedido","Usuario","Rol","Estado anterior","Estado nuevo","Notas"]],body:data.map(h=>[fmtDateTime(h.created_at),h.pedido_id,h.usuario_nombre,ROLES[h.usuario_role]?.label||h.usuario_role,h.estado_anterior||"—",h.estado_nuevo,h.notas||""]),styles:{fontSize:8,cellPadding:3},headStyles:{fillColor:[94,122,64],textColor:255,fontStyle:"bold"},alternateRowStyles:{fillColor:[242,244,238]}});doc.save(`${nombre}.pdf`);};

  const visible=useMemo(()=>{let r=orders;if(user&&!["admin","proveedor","responsable"].includes(user.role))r=r.filter(o=>o.solicitante===user.name);if(filterEstado!=="Todos")r=r.filter(o=>o.estado===filterEstado);if(filterCat!=="Todas")r=r.filter(o=>o.categoria===filterCat);if(search)r=r.filter(o=>[o.producto,o.id,o.solicitante].some(v=>v.toLowerCase().includes(search.toLowerCase())));return r;},[orders,user,filterEstado,filterCat,search]);
  const visibleHist=useMemo(()=>{
    let r=[...historial];
    // búsqueda libre
    if(histSearch) r=r.filter(h=>[h.pedido_id,h.usuario_nombre,h.estado_anterior,h.estado_nuevo,h.notas].some(v=>v&&v.toLowerCase().includes(histSearch.toLowerCase())));
    // filtro estado nuevo
    if(histFiltroEstado!=="Todos") r=r.filter(h=>h.estado_nuevo===histFiltroEstado);
    // filtro usuario
    if(histFiltroUsuario!=="Todos") r=r.filter(h=>h.usuario_nombre===histFiltroUsuario);
    // ordenación
    r.sort((a,b)=>{
      switch(histSort){
        case "fecha_asc":    return new Date(a.created_at)-new Date(b.created_at);
        case "fecha_desc":   return new Date(b.created_at)-new Date(a.created_at);
        case "pedido_asc":   return a.pedido_id.localeCompare(b.pedido_id);
        case "pedido_desc":  return b.pedido_id.localeCompare(a.pedido_id);
        case "estado_nuevo": return (a.estado_nuevo||"").localeCompare(b.estado_nuevo||"");
        case "usuario":      return (a.usuario_nombre||"").localeCompare(b.usuario_nombre||"");
        default: return 0;
      }
    });
    return r;
  },[historial,histSearch,histSort,histFiltroEstado,histFiltroUsuario]);

  const addHistorial=async(pedidoId,estadoAnterior,estadoNuevo,notas="")=>{await supabase.from("historial").insert({pedido_id:pedidoId,usuario_nombre:user.name,usuario_role:user.role,estado_anterior:estadoAnterior,estado_nuevo:estadoNuevo,notas});};
  const updateOrder=async(id,changes)=>{
    const db={};
    if(changes.estado!==undefined)          db.estado=changes.estado;
    if(changes.producto)                    db.producto=changes.producto;
    if(changes.categoria)                   db.categoria=changes.categoria;
    if(changes.cantidad)                    db.cantidad=changes.cantidad;
    if(changes.precio!==undefined)          db.precio=changes.precio;
    if(changes.solicitante)                 db.solicitante=changes.solicitante;
    if(changes.fechaEstimada!==undefined)   db.fecha_estimada=changes.fechaEstimada||null;
    if(changes.fechaEntrega!==undefined)    db.fecha_entrega=changes.fechaEntrega||"";
    if(changes.tracking!==undefined)        db.tracking=changes.tracking||"";
    if(changes.notas!==undefined)           db.notas=changes.notas||"";
    if(changes.notasIncidencia!==undefined) db.notas_incidencia=changes.notasIncidencia||"";
    await supabase.from("pedidos").update(db).eq("id",id);
    setOrders(p=>p.map(o=>o.id===id?{...o,...changes}:o));
    setSelected(p=>p?.id===id?{...p,...changes}:p);
  };
  const deleteOrder=async(id)=>{await supabase.from("pedidos").delete().eq("id",id);setOrders(p=>p.filter(o=>o.id!==id));setSelected(null);showToast("Pedido eliminado");};
  const changeEstado=async(id,estado)=>{const order=orders.find(o=>o.id===id);const ch={estado};if(estado==="Entregado")ch.fechaEntrega=fmtDate();await updateOrder(id,ch);await addHistorial(id,order?.estado||"",estado);showToast(`Estado → ${estado}`);};
  const createOrder=async(data)=>{const newId=nextPedidoId(orders);const row={id:newId,producto:data.producto,categoria:data.categoria,cantidad:data.cantidad,precio:data.precio||0,solicitante:user.name,estado:"Nuevo pedido",fecha_solicitud:new Date().toISOString().slice(0,10),fecha_estimada:data.fechaEstimada||null,tracking:"",fecha_entrega:"",notas:data.notas||"",notas_incidencia:""};await supabase.from("pedidos").insert(row);await addHistorial(newId,"","Nuevo pedido","Pedido creado");await loadOrders();showToast("Pedido creado");};
  const saveUser=async(data)=>{
    if(data.id){await supabase.from("usuarios").update({name:data.name,email:data.email,role:data.role}).eq("id",data.id);setUsers(p=>p.map(u=>u.id===data.id?{...u,...data}:u));if(user.id===data.id)setUser(d=>({...d,...data}));showToast("Usuario actualizado");}
    else{const{data:ad,error}=await supabase.auth.signUp({email:data.email,password:data.password});if(error){showToast("Error: "+error.message,"err");return;}await supabase.from("usuarios").insert({id:ad.user.id,name:data.name,email:data.email,role:data.role});await loadUsers();showToast("Usuario creado");}
    setUserModal(null);
  };
  const deleteUser=async(id)=>{if(id===user.id){showToast("No puedes eliminarte","err");return;}await supabase.from("usuarios").delete().eq("id",id);setUsers(p=>p.filter(u=>u.id!==id));showToast("Usuario eliminado");};

  /* ── Login ─────────────────────────────────────────────────────────────── */
  if(!user) return (
    <div style={{minHeight:"100vh",background:T.bg,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Inter',system-ui,sans-serif",padding:"1.5rem"}}>
      <div style={{display:"flex",width:"100%",maxWidth:820,borderRadius:16,overflow:"hidden",border:`0.5px solid ${T.borderM}`,minHeight:520}}>
        <div style={{width:240,flexShrink:0,background:OL[600],padding:"2rem 1.5rem",display:"flex",flexDirection:"column",justifyContent:"space-between"}}>
          <div>
            <div style={{width:44,height:44,borderRadius:12,background:"rgba(255,255,255,0.15)",display:"flex",alignItems:"center",justifyContent:"center",marginBottom:"1.5rem"}}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="1.8"><path d="M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/></svg>
            </div>
            <div style={{color:"#fff",fontSize:18,fontWeight:500,lineHeight:1.4,marginBottom:6}}>Portal de pedidos</div>
            <div style={{color:"rgba(255,255,255,0.55)",fontSize:13,lineHeight:1.6,marginBottom:"1.5rem"}}>Sistema de gestión empresa–proveedor</div>
            {["Seguimiento en tiempo real","Control por roles","Historial completo","Acceso desde cualquier lugar"].map(feat=>(
              <div key={feat} style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                <div style={{width:5,height:5,borderRadius:"50%",background:"rgba(255,255,255,0.45)",flexShrink:0}}/>
                <div style={{color:"rgba(255,255,255,0.75)",fontSize:12}}>{feat}</div>
              </div>
            ))}
          </div>
          <div style={{color:"rgba(255,255,255,0.2)",fontSize:11}}>v1.0</div>
        </div>
        <div style={{flex:1,background:T.surface,padding:"2.5rem 2rem",display:"flex",flexDirection:"column",justifyContent:"center"}}>
          <div style={{marginBottom:28}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <div style={{display:"inline-flex",alignItems:"center",gap:5,background:OL[50],color:OL[800],fontSize:11,fontWeight:500,padding:"3px 10px",borderRadius:20}}>
                <div style={{width:6,height:6,borderRadius:"50%",background:OL[600]}}/>
                Portal activo
              </div>
              <DarkToggle dark={dark} onToggle={()=>setDark(d=>!d)} T={T}/>
            </div>
            <div style={{fontSize:22,fontWeight:500,color:T.t1,marginBottom:6}}>Bienvenido</div>
            <div style={{fontSize:14,color:T.t2}}>Introduce tus credenciales para acceder</div>
          </div>
          <LoginForm T={T} onLogin={u=>{setUser(u);setTab("inicio");setCollapsed({nuevos:true,curso:true,finalizados:true});}}/>
          <div style={{height:"0.5px",background:T.border,margin:"20px 0"}}/>
          <div style={{fontSize:12,color:T.t3,textAlign:"center"}}>¿Problemas para acceder? Contacta con el administrador</div>
        </div>
      </div>
    </div>
  );

  /* ── App shell ──────────────────────────────────────────────────────────── */
  const nuevos      = user.role==="proveedor"?visible.filter(o=>o.estado==="Nuevo pedido"):[];
  const enCurso     = visible.filter(o=>!["Entregado","Cancelado",...ESTADOS_PROVEEDOR_POST].includes(o.estado)&&(user.role!=="proveedor"||o.estado!=="Nuevo pedido"));
  const finalizados = visible.filter(o=>["Entregado","Cancelado",...ESTADOS_PROVEEDOR_POST].includes(o.estado));
  const rp=(o,i,hl=false,gc=null)=>({order:o,user,idx:i,highlight:hl,T,groupColors:gc,onSelect:()=>setSelected(o),onChangeEstado:est=>changeEstado(o.id,est)});
  const pendingCount = orders.filter(o=>o.estado==="Nuevo pedido").length;
  const selInp={padding:"7px 12px",borderRadius:8,border:`0.5px solid ${T.borderM}`,fontSize:13,background:T.surface,color:T.t1,cursor:"pointer"};

  const handleSidebarTab = (t) => {
    if(t==="nuevo"){setShowForm(true);return;}
    setTab(t);
  };

  return (
    <div style={{minHeight:"100vh",background:T.bg,fontFamily:"'Inter',system-ui,sans-serif",display:"flex"}}>
      {toast&&<Toast {...toast}/>}
      <Sidebar user={user} tab={tab} onTab={handleSidebarTab} pendingCount={pendingCount} T={T}/>
      <div style={{flex:1,minWidth:0,display:"flex",flexDirection:"column"}}>
        {/* Topbar delgado */}
        <div style={{background:T.surface,borderBottom:`0.5px solid ${T.border}`,padding:"0 20px",display:"flex",alignItems:"center",justifyContent:"flex-end",height:46,gap:10,flexShrink:0}}>
          <DarkToggle dark={dark} onToggle={()=>setDark(d=>!d)} T={T}/>
          <RoleBadge role={user.role}/>
          <button onClick={async()=>{await supabase.auth.signOut();setUser(null);setSelected(null);}} style={{fontSize:11,color:T.t2,background:"none",border:`0.5px solid ${T.border}`,borderRadius:6,padding:"4px 10px",cursor:"pointer"}}>Salir</button>
        </div>

        {/* Contenido por tab */}
        <div style={{flex:1,overflowY:"auto"}}>

          {tab==="inicio"&&<Dashboard user={user} orders={orders} T={T}/>}

          {tab==="pedidos"&&(
            <div style={{padding:"18px 20px"}}>
              <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:16,alignItems:"center"}}>
                <div style={{flex:1,minWidth:200,position:"relative"}}>
                  <div style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:T.t3,pointerEvents:"none"}}><SearchIcon/></div>
                  <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar pedido, producto, solicitante…" style={{...mkInp(T),paddingLeft:32}}/>
                </div>
                <select value={filterEstado} onChange={e=>setFilterEstado(e.target.value)} style={selInp}><option>Todos</option>{ESTADOS.map(e=><option key={e}>{e}</option>)}</select>
                <select value={filterCat} onChange={e=>setFilterCat(e.target.value)} style={selInp}><option>Todas</option>{CATEGORIAS.map(c=><option key={c}>{c}</option>)}</select>
                {(user.role==="empleado"||user.role==="admin")&&<button onClick={()=>setShowForm(true)} style={mkBtnPrimary()}>+ Nuevo pedido</button>}
              </div>
              {["admin","proveedor"].includes(user.role)&&(
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:8,marginBottom:16}}>
                  {[{label:"Nuevos",val:orders.filter(o=>o.estado==="Nuevo pedido").length,bg:OL[50],text:OL[800]},{label:"En preparación",val:orders.filter(o=>o.estado==="En preparación").length,bg:"#FAEEDA",text:"#633806"},{label:"En tránsito",val:orders.filter(o=>o.estado==="Enviado / en tránsito").length,bg:OL[100],text:OL[800]},{label:"Entregados",val:orders.filter(o=>o.estado==="Entregado").length,bg:"#EAF3DE",text:"#27500A"}].map(s=>(
                    <div key={s.label} style={{background:s.bg,borderRadius:10,padding:"12px 14px",border:`0.5px solid ${T.border}`}}><div style={{fontSize:11,color:s.text,marginBottom:4,fontWeight:500}}>{s.label}</div><div style={{fontSize:20,fontWeight:500,color:s.text}}>{s.val}</div></div>
                  ))}
                </div>
              )}
              {loading?<Spinner T={T}/>:<>
                {visible.length===0&&<div style={{textAlign:"center",padding:"4rem",color:T.t3,fontSize:14}}>No hay pedidos que mostrar</div>}
                {nuevos.length>0&&<div style={{marginBottom:20}}><SectionHead s={SECTION.nuevos} count={nuevos.length} collapsed={collapsed.nuevos} onToggle={()=>toggle("nuevos")} pulsing/>{!collapsed.nuevos&&<div style={{display:"flex",flexDirection:"column",gap:8}}>{nuevos.map((o,i)=><OrderRow key={o.id} {...rp(o,i,true)}/>)}</div>}</div>}
                {enCurso.length>0&&<div style={{marginBottom:20}}><SectionHead s={SECTION.curso} count={enCurso.length} collapsed={collapsed.curso} onToggle={()=>toggle("curso")} pulsing={false}/>{!collapsed.curso&&<div style={{display:"flex",flexDirection:"column",gap:8}}>{enCurso.map((o,i)=><OrderRow key={o.id} {...rp(o,i,false,{light:"#E1F5EE",dark:"#D0EDE0",border:"#9FE1CB"})}/>)}</div>}</div>}
                {finalizados.length>0&&<div><SectionHead s={SECTION.finalizados} count={finalizados.length} collapsed={collapsed.finalizados} onToggle={()=>toggle("finalizados")} pulsing={false}/>{!collapsed.finalizados&&<div style={{display:"flex",flexDirection:"column",gap:8,opacity:.65,filter:"saturate(.6)"}}>{finalizados.map((o,i)=><OrderRow key={o.id} {...rp(o,i,false,{light:"#FAECE7",dark:"#F5C4B3",border:"#F0997B"})}/>)}</div>}</div>}
              </>}
            </div>
          )}

          {tab==="historial"&&(()=>{
            // usuarios únicos para el filtro desplegable
            const usuariosUnicos=[...new Set(historial.map(h=>h.usuario_nombre))].sort();
            // cabecera de columna clicable
            const ColH=({label,sortKey,sortKeyAlt,minWidth})=>{
              const isActive=histSort===sortKey||histSort===sortKeyAlt;
              const isAsc=histSort===sortKey;
              const toggle=()=>setHistSort(isAsc&&sortKeyAlt?sortKeyAlt:sortKey);
              return (
                <div onClick={toggle} style={{minWidth,fontSize:11,fontWeight:500,color:isActive?OL[600]:T.t3,cursor:"pointer",display:"flex",alignItems:"center",gap:3,userSelect:"none",flexShrink:0}}>
                  {label}
                  <svg width="10" height="10" viewBox="0 0 10 14" fill="none" stroke={isActive?OL[600]:T.t3} strokeWidth="1.5">
                    {isAsc
                      ? <><path d="M5 1v12M1 9l4 4 4-4" opacity="1"/><path d="M1 5l4-4 4 4" opacity="0.3"/></>
                      : <><path d="M5 1v12M1 5l4-4 4 4" opacity="1"/><path d="M1 9l4 4 4-4" opacity="0.3"/></>}
                  </svg>
                </div>
              );
            };
            return (
              <div style={{padding:"18px 20px"}}>
                {/* Barra de controles */}
                <div style={{display:"flex",gap:8,marginBottom:10,alignItems:"center",flexWrap:"wrap"}}>
                  <div style={{flex:1,minWidth:200,position:"relative"}}>
                    <div style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:T.t3,pointerEvents:"none"}}><SearchIcon/></div>
                    <input value={histSearch} onChange={e=>setHistSearch(e.target.value)} placeholder="Buscar pedido, usuario, estado, notas…" style={{...mkInp(T),paddingLeft:32}}/>
                  </div>
                  <select value={histFiltroEstado} onChange={e=>setHistFiltroEstado(e.target.value)} style={{...selInp,minWidth:140}}>
                    <option value="Todos">Todos los estados</option>
                    {ESTADOS.map(e=><option key={e} value={e}>{e}</option>)}
                  </select>
                  <select value={histFiltroUsuario} onChange={e=>setHistFiltroUsuario(e.target.value)} style={{...selInp,minWidth:130}}>
                    <option value="Todos">Todos los usuarios</option>
                    {usuariosUnicos.map(u=><option key={u} value={u}>{u}</option>)}
                  </select>
                  {(histSearch||histFiltroEstado!=="Todos"||histFiltroUsuario!=="Todos")&&(
                    <button onClick={()=>{setHistSearch("");setHistFiltroEstado("Todos");setHistFiltroUsuario("Todos");}} style={{fontSize:11,padding:"6px 10px",borderRadius:8,border:`0.5px solid ${T.border}`,background:T.surface,color:T.t3,cursor:"pointer",whiteSpace:"nowrap"}}>Limpiar</button>
                  )}
                  <span style={{fontSize:12,color:T.t3,whiteSpace:"nowrap",marginLeft:"auto"}}>{visibleHist.length} entradas</span>
                </div>

                {/* Exportar */}
                <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap"}}>
                  {[{label:"↓ XLSX (vista)",fn:()=>exportXLSX(visibleHist,"historial-filtrado"),bg:"#EAF3DE",color:"#27500A",border:"#C0DD97"},{label:"↓ PDF (vista)",fn:()=>exportPDF(visibleHist,"historial-filtrado"),bg:"#FCEBEB",color:"#791F1F",border:"#F09595"},{label:"↓ XLSX (todo)",fn:()=>exportXLSX(historial,"historial-completo"),bg:OL[50],color:OL[800],border:OL[200]},{label:"↓ PDF (todo)",fn:()=>exportPDF(historial,"historial-completo"),bg:"#FAEEDA",color:"#633806",border:"#FAC775"}].map(b=>(
                    <button key={b.label} onClick={b.fn} style={{fontSize:12,padding:"5px 12px",borderRadius:8,border:`0.5px solid ${b.border}`,background:b.bg,color:b.color,cursor:"pointer",fontWeight:500}}>{b.label}</button>
                  ))}
                </div>

                {/* Cabecera de tabla clicable */}
                <div style={{display:"flex",alignItems:"center",gap:12,padding:"6px 16px",marginBottom:4,flexWrap:"nowrap",overflowX:"auto"}}>
                  <ColH label="Fecha"   sortKey="fecha_desc"  sortKeyAlt="fecha_asc"  minWidth={116}/>
                  <ColH label="Usuario" sortKey="usuario"     sortKeyAlt={null}        minWidth={130}/>
                  <ColH label="Pedido"  sortKey="pedido_asc"  sortKeyAlt="pedido_desc" minWidth={72}/>
                  <ColH label="Estado"  sortKey="estado_nuevo" sortKeyAlt={null}       minWidth={200}/>
                </div>

                {/* Filas */}
                {visibleHist.length===0
                  ? <div style={{textAlign:"center",padding:"4rem",color:T.t3,fontSize:14}}>No hay movimientos que coincidan</div>
                  : <div style={{display:"flex",flexDirection:"column",gap:5}}>
                      {visibleHist.map((h,i)=>{
                        const r=ROLES[h.usuario_role]||ROLES.empleado;
                        const cOld=ECOLOR[h.estado_anterior]||{bg:"#F1EFE8",text:"#444441"};
                        const cNew=ECOLOR[h.estado_nuevo]||{bg:"#F1EFE8",text:"#444441"};
                        return (
                          <div key={h.id} style={{background:i%2===0?T.surface:T.surf2,border:`0.5px solid ${T.border}`,borderRadius:10,padding:"10px 16px",display:"flex",alignItems:"center",gap:12,flexWrap:"nowrap",overflowX:"auto"}}>
                            <div style={{fontSize:11,color:T.t3,minWidth:116,flexShrink:0,fontFamily:"monospace"}}>{fmtDateTime(h.created_at)}</div>
                            <div style={{display:"flex",alignItems:"center",gap:7,minWidth:130,flexShrink:0}}>
                              <Avatar name={h.usuario_nombre} role={h.usuario_role} size={24}/>
                              <div>
                                <div style={{fontSize:12,fontWeight:500,color:T.t1,whiteSpace:"nowrap"}}>{h.usuario_nombre}</div>
                                <span style={{background:r.bg,color:r.text,fontSize:9,fontWeight:500,padding:"1px 6px",borderRadius:20}}>{r.label}</span>
                              </div>
                            </div>
                            <div style={{fontSize:11,fontWeight:500,color:T.t2,minWidth:72,flexShrink:0,fontFamily:"monospace"}}>{h.pedido_id}</div>
                            <div style={{display:"flex",alignItems:"center",gap:6,flex:1,minWidth:200,flexWrap:"nowrap"}}>
                              {h.estado_anterior?<span style={{background:cOld.bg,color:cOld.text,fontSize:11,fontWeight:500,padding:"2px 8px",borderRadius:20,whiteSpace:"nowrap"}}>{h.estado_anterior}</span>:<span style={{fontSize:11,color:T.t3,flexShrink:0}}>—</span>}
                              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke={T.t3} strokeWidth="1.4" style={{flexShrink:0}}><path d="M2 6h8M7 3l3 3-3 3"/></svg>
                              <span style={{background:cNew.bg,color:cNew.text,fontSize:11,fontWeight:500,padding:"2px 8px",borderRadius:20,whiteSpace:"nowrap"}}>{h.estado_nuevo}</span>
                            </div>
                            {h.notas&&<div style={{fontSize:11,color:T.t3,fontStyle:"italic",minWidth:80,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:180}}>{h.notas}</div>}
                          </div>
                        );
                      })}
                    </div>}
              </div>
            );
          })()}

          {tab==="usuarios"&&user.role==="admin"&&(
            <div style={{padding:"18px 20px"}}>
              <UsersPanel users={users} currentUser={user} T={T} onNew={()=>setUserModal("new")} onEdit={u=>setUserModal(u)} onDelete={deleteUser}/>
            </div>
          )}

        </div>
      </div>

      {selected&&<DetailPanel order={selected} user={user} T={T} onClose={()=>setSelected(null)} onUpdate={async ch=>{await updateOrder(selected.id,ch);showToast("Pedido actualizado");}} onDelete={()=>deleteOrder(selected.id)} onChangeEstado={est=>changeEstado(selected.id,est)}/>}
      {showForm&&<NewOrderModal user={user} T={T} onClose={()=>setShowForm(false)} onCreate={async data=>{await createOrder(data);setShowForm(false);}}/>}
      {userModal&&<UserModal userData={userModal==="new"?null:userModal} T={T} onSave={saveUser} onClose={()=>setUserModal(null)}/>}
    </div>
  );
}
