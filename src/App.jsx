import { useState, useMemo, useEffect, useCallback } from "react";
import { supabase } from "./supabase";

const ROLES = {
  empleado:    { label:"Empleado",      color:"#AFA9EC", bg:"#EEEDFE", text:"#3C3489" },
  responsable: { label:"Responsable",   color:"#9FE1CB", bg:"#E1F5EE", text:"#085041" },
  proveedor:   { label:"Proveedor",     color:"#FAC775", bg:"#FAEEDA", text:"#633806" },
  admin:       { label:"Administrador", color:"#F4C0D1", bg:"#FBEAF0", text:"#72243E" },
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

const fmtDate = () => { const d=new Date(); return `${String(d.getDate()).padStart(2,"0")}-${String(d.getMonth()+1).padStart(2,"0")}-${d.getFullYear()}`; };
const nextPedidoId = (orders) => "PED-"+String(Math.max(0,...orders.map(o=>parseInt(o.id.split("-")[1]||0)))+1).padStart(3,"0");

const canTransition = (role, from, to) => {
  if (from==="Cancelado") return false;
  if (to==="Nuevo pedido" && ["Entregado",...ESTADOS_PROVEEDOR_POST].includes(from)) return false;
  if (role==="admin") return true;
  if (role==="responsable" && from==="Nuevo pedido" && to==="Cancelado") return true;
  if (role==="proveedor") {
    const flow=["Nuevo pedido","En preparación","Enviado / en tránsito"];
    if (flow.indexOf(to)===flow.indexOf(from)+1) return true;
    if (from==="Entregado" && ESTADOS_PROVEEDOR_POST.includes(to)) return true;
    if (ESTADOS_PROVEEDOR_POST.includes(from)) {
      const pi=ESTADOS_PROVEEDOR_POST.indexOf(from), ti=ESTADOS_PROVEEDOR_POST.indexOf(to);
      if (ti===pi+1) return true;
      if (from!=="En garantía / incidencia" && to==="En garantía / incidencia") return true;
      return false;
    }
    if (to==="Cancelado") return true;
    return false;
  }
  if (role==="empleado"||role==="responsable") return from==="Enviado / en tránsito" && to==="Entregado";
  return false;
};
const nextStates = (role, cur) => ESTADOS.filter(s=>s!==cur&&canTransition(role,cur,s));

const Pill = ({estado}) => { const c=ECOLOR[estado]||{bg:"#F1EFE8",text:"#444441"}; return <span style={{background:c.bg,color:c.text,fontSize:11,fontWeight:500,padding:"2px 10px",borderRadius:20,whiteSpace:"nowrap"}}>{estado}</span>; };
const Avatar = ({name,role,size=38}) => { const r=ROLES[role]||ROLES.empleado; const ini=name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase(); return <div style={{width:size,height:size,borderRadius:"50%",background:r.bg,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*0.35,fontWeight:500,color:r.text}}>{ini}</div>; };
const Toast = ({msg,type}) => <div style={{position:"fixed",top:16,right:16,zIndex:999,background:type==="ok"?"#E1F5EE":"#FBEAF0",color:type==="ok"?"#085041":"#72243E",padding:"10px 18px",borderRadius:10,fontSize:13,fontWeight:500,border:`0.5px solid ${type==="ok"?"#9FE1CB":"#F4C0D1"}`}}>{msg}</div>;
const DarkToggle = ({dark,onToggle}) => <button onClick={onToggle} style={{width:32,height:32,borderRadius:"50%",border:"0.5px solid rgba(128,128,128,0.25)",background:dark?"#3a3a36":"#eeece7",cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{dark?"☀️":"🌙"}</button>;
const PulseBar = () => (<><style>{`@keyframes barPulse{0%,100%{opacity:1;width:6px;background:#534AB7;}50%{opacity:0.85;width:10px;background:#AFA9EC;}}`}</style><div style={{position:"absolute",left:0,top:0,bottom:0,width:6,borderRadius:"12px 0 0 12px",background:"#534AB7",animation:"barPulse 1s ease-in-out infinite"}}/></>);
const BP = {background:"#AFA9EC",color:"#26215C",border:"none",borderRadius:8,padding:"8px 16px",fontSize:13,fontWeight:500,cursor:"pointer"};
const Spinner = () => <div style={{display:"flex",alignItems:"center",justifyContent:"center",padding:"3rem",color:"#9c9a92",fontSize:13}}>Cargando…</div>;

function SectionHead({label,count,bg,border,dot,text,cBg,cText,collapsed,onToggle,pulsing}) {
  return (<><style>{`@keyframes headPulse{0%,100%{opacity:1;background:${bg}}50%{opacity:0.7;background:${cBg}20}}`}</style>
    <div onClick={onToggle} style={{display:"flex",alignItems:"center",gap:10,marginBottom:collapsed?0:12,padding:"10px 14px",borderRadius:10,background:bg,border:`0.5px solid ${border}`,cursor:"pointer",userSelect:"none",animation:pulsing?"headPulse 1.4s ease-in-out infinite":"none",transition:"margin .2s"}}>
      <span style={{width:10,height:10,borderRadius:"50%",background:dot,display:"inline-block",flexShrink:0}}></span>
      <span style={{fontSize:13,fontWeight:500,color:text,flex:1}}>{label}</span>
      <span style={{background:cBg,color:cText,fontSize:11,fontWeight:500,padding:"2px 10px",borderRadius:20,marginRight:6}}>{count}</span>
      <span style={{fontSize:12,color:text,opacity:0.7,transition:"transform .2s",display:"inline-block",transform:collapsed?"rotate(-90deg)":"rotate(0deg)"}}>▾</span>
    </div></>);
}

function LoginForm({T, onLogin}) {
  const [email,setEmail]       = useState("");
  const [password,setPassword] = useState("");
  const [showPwd,setShowPwd]   = useState(false);
  const [error,setError]       = useState("");
  const [loading,setLoading]   = useState(false);
  const inp = {padding:"8px 12px",borderRadius:8,border:`0.5px solid ${T.border}`,fontSize:13,background:T.surface,color:T.t1,width:"100%"};

  const handleLogin = async () => {
    setLoading(true); setError("");
    const { data, error: authErr } = await supabase.auth.signInWithPassword({ email, password });
    if (authErr) { setError("Email o contraseña incorrectos"); setLoading(false); return; }
    const { data: userData } = await supabase.from("usuarios").select("*").eq("id", data.user.id).single();
    if (userData) onLogin(userData);
    else { setError("Usuario no encontrado en la base de datos"); setLoading(false); }
  };

  return (
    <div>
      <div style={{marginBottom:14}}>
        <div style={{fontSize:11,color:T.t3,marginBottom:4}}>Email</div>
        <input type="email" value={email} onChange={e=>{setEmail(e.target.value);setError("");}} placeholder="correo@empresa.com" style={inp} onKeyDown={e=>e.key==="Enter"&&handleLogin()}/>
      </div>
      <div style={{marginBottom:6}}>
        <div style={{fontSize:11,color:T.t3,marginBottom:4}}>Contraseña</div>
        <div style={{position:"relative"}}>
          <input type={showPwd?"text":"password"} value={password} onChange={e=>{setPassword(e.target.value);setError("");}} placeholder="••••••••" style={{...inp,paddingRight:40}} onKeyDown={e=>e.key==="Enter"&&handleLogin()}/>
          <button onClick={()=>setShowPwd(p=>!p)} style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",fontSize:14,color:T.t3}}>{showPwd?"🙈":"👁️"}</button>
        </div>
      </div>
      {error&&<div style={{fontSize:12,color:"#72243E",background:"#FBEAF0",padding:"8px 12px",borderRadius:8,marginTop:8,marginBottom:4}}>{error}</div>}
      <div style={{marginBottom:16}}></div>
      <button onClick={handleLogin} disabled={loading} style={{...BP,width:"100%",padding:"11px",borderRadius:10,fontSize:14,opacity:loading?0.7:1}}>{loading?"Entrando…":"Entrar"}</button>
    </div>
  );
}

export default function App() {
  const [dark,setDark]          = useState(()=>JSON.parse(localStorage.getItem("dark")||"false"));
  const [user,setUser]          = useState(null);
  const [orders,setOrders]      = useState([]);
  const [loading,setLoading]    = useState(false);
  const [tab,setTab]            = useState("pedidos");
  const [users,setUsers]        = useState([]);
  const [selected,setSelected]  = useState(null);
  const [showForm,setShowForm]  = useState(false);
  const [filterEstado,setFilterEstado] = useState("Todos");
  const [filterCat,setFilterCat]       = useState("Todas");
  const [search,setSearch]      = useState("");
  const [toast,setToast]        = useState(null);
  const [userModal,setUserModal]= useState(null);
  const [collapsed,setCollapsed]= useState({nuevos:true,curso:true,finalizados:true});

  const T = {
    bg:      dark?"#1a1a18":"#f7f6f3",
    surface: dark?"#252522":"#ffffff",
    surf2:   dark?"#2e2e2a":"#edecea",
    t1:      dark?"#e8e6de":"#1a1a18",
    t2:      dark?"#9c9a92":"#6b6a64",
    t3:      dark?"#6b6a64":"#9c9a92",
    border:  dark?"rgba(255,255,255,0.08)":"rgba(0,0,0,0.08)",
  };

  useEffect(()=>{ localStorage.setItem("dark",JSON.stringify(dark)); },[dark]);

  const showToast = (msg,type="ok") => { setToast({msg,type}); setTimeout(()=>setToast(null),3000); };
  const toggle    = (key) => setCollapsed(p=>({...p,[key]:!p[key]}));

  const loadOrders = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("pedidos").select("*").order("created_at",{ascending:false});
    if (data) setOrders(data.map(o=>({
      id: o.id, producto: o.producto, categoria: o.categoria, cantidad: o.cantidad,
      precio: o.precio, solicitante: o.solicitante, estado: o.estado,
      fechaSolicitud: o.fecha_solicitud, fechaEstimada: o.fecha_estimada||"",
      fechaEntrega: o.fecha_entrega||"", tracking: o.tracking||"",
      notas: o.notas||"", notasIncidencia: o.notas_incidencia||"",
    })));
    setLoading(false);
  },[]);

  const loadUsers = useCallback(async () => {
    const { data } = await supabase.from("usuarios").select("*");
    if (data) setUsers(data);
  },[]);

  useEffect(()=>{ if(user){ loadOrders(); loadUsers(); } },[user,loadOrders,loadUsers]);

  // Suscripción en tiempo real
  useEffect(()=>{
    if (!user) return;
    const sub = supabase.channel("pedidos-changes")
      .on("postgres_changes",{event:"*",schema:"public",table:"pedidos"},()=>loadOrders())
      .subscribe();
    return ()=>supabase.removeChannel(sub);
  },[user,loadOrders]);

  const visible = useMemo(()=>{
    let r=orders;
    if (user&&!["admin","responsable,"proveedor"].includes(user.role)) r=r.filter(o=>o.solicitante===user.name);
    if (filterEstado!=="Todos") r=r.filter(o=>o.estado===filterEstado);
    if (filterCat!=="Todas")    r=r.filter(o=>o.categoria===filterCat);
    if (search) r=r.filter(o=>[o.producto,o.id,o.solicitante].some(v=>v.toLowerCase().includes(search.toLowerCase())));
    return r;
  },[orders,user,filterEstado,filterCat,search]);

  const updateOrder = async (id, changes) => {
    const dbChanges = {};
    if (changes.estado)          dbChanges.estado           = changes.estado;
    if (changes.producto)        dbChanges.producto         = changes.producto;
    if (changes.categoria)       dbChanges.categoria        = changes.categoria;
    if (changes.cantidad)        dbChanges.cantidad         = changes.cantidad;
    if (changes.precio!==undefined) dbChanges.precio        = changes.precio;
    if (changes.solicitante)     dbChanges.solicitante      = changes.solicitante;
    if (changes.fechaEstimada!==undefined) dbChanges.fecha_estimada = changes.fechaEstimada||null;
    if (changes.fechaEntrega!==undefined)  dbChanges.fecha_entrega  = changes.fechaEntrega||"";
    if (changes.tracking!==undefined)      dbChanges.tracking       = changes.tracking||"";
    if (changes.notas!==undefined)         dbChanges.notas          = changes.notas||"";
    if (changes.notasIncidencia!==undefined) dbChanges.notas_incidencia = changes.notasIncidencia||"";
    await supabase.from("pedidos").update(dbChanges).eq("id",id);
    setOrders(p=>p.map(o=>o.id===id?{...o,...changes}:o));
    setSelected(p=>p?.id===id?{...p,...changes}:p);
  };

  const deleteOrder = async (id) => {
    await supabase.from("pedidos").delete().eq("id",id);
    setOrders(p=>p.filter(o=>o.id!==id));
    setSelected(null); showToast("Pedido eliminado");
  };

  const changeEstado = async (id, estado) => {
    const changes = {estado};
    if (estado==="Entregado") changes.fechaEntrega=fmtDate();
    await updateOrder(id, changes);
    showToast(`Estado → ${estado}`);
  };

  const createOrder = async (data) => {
    const newId = nextPedidoId(orders);
    const row = {
      id: newId, producto: data.producto, categoria: data.categoria,
      cantidad: data.cantidad, precio: data.precio||0,
      solicitante: user.name, estado: "Nuevo pedido",
      fecha_solicitud: new Date().toISOString().slice(0,10),
      fecha_estimada: data.fechaEstimada||null,
      tracking: "", fecha_entrega: "", notas: data.notas||"", notas_incidencia: "",
    };
    await supabase.from("pedidos").insert(row);
    await loadOrders();
    showToast("Pedido creado");
  };

  const saveUser = async (data) => {
    if (data.id) {
      await supabase.from("usuarios").update({name:data.name,email:data.email,role:data.role}).eq("id",data.id);
      if (data.password) await supabase.auth.admin.updateUserById(data.id,{password:data.password});
      setUsers(p=>p.map(u=>u.id===data.id?{...u,...data}:u));
      if (user.id===data.id) setUser(d=>({...d,...data}));
      showToast("Usuario actualizado");
    } else {
      const { data: authData, error } = await supabase.auth.signUp({email:data.email,password:data.password});
      if (error) { showToast("Error al crear usuario: "+error.message,"err"); return; }
      await supabase.from("usuarios").insert({id:authData.user.id,name:data.name,email:data.email,role:data.role});
      await loadUsers();
      showToast("Usuario creado — debe confirmar su email");
    }
    setUserModal(null);
  };

  const deleteUser = async (id) => {
    if (id===user.id) { showToast("No puedes eliminarte","err"); return; }
    await supabase.from("usuarios").delete().eq("id",id);
    setUsers(p=>p.filter(u=>u.id!==id));
    showToast("Usuario eliminado");
  };

  if (!user) return (
    <div style={{minHeight:"100vh",background:T.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:"system-ui,sans-serif"}}>
      <div style={{background:T.surface,borderRadius:16,border:`0.5px solid ${T.border}`,padding:"2.5rem 2rem",width:"100%",maxWidth:400}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
          <div style={{fontSize:18,fontWeight:500,color:T.t1}}>Portal de pedidos</div>
          <DarkToggle dark={dark} onToggle={()=>setDark(d=>!d)}/>
        </div>
        <div style={{fontSize:13,color:T.t3,marginBottom:24}}>Introduce tus credenciales</div>
        <LoginForm T={T} onLogin={u=>{setUser(u);setCollapsed({nuevos:true,curso:true,finalizados:true});}}/>
      </div>
    </div>
  );

  const nuevos      = user.role==="proveedor" ? visible.filter(o=>o.estado==="Nuevo pedido") : [];
  const enCurso     = visible.filter(o=>!["Entregado","Cancelado",...ESTADOS_PROVEEDOR_POST].includes(o.estado)&&(user.role!=="proveedor"||o.estado!=="Nuevo pedido"));
  const finalizados = visible.filter(o=>["Entregado","Cancelado",...ESTADOS_PROVEEDOR_POST].includes(o.estado));
  const rp = (o,i,highlight=false,gc=null) => ({order:o,user,idx:i,highlight,T,groupColors:gc,onSelect:()=>setSelected(o),onChangeEstado:est=>changeEstado(o.id,est)});

  return (
    <div style={{minHeight:"100vh",background:T.bg,fontFamily:"system-ui,sans-serif"}}>
      {toast&&<Toast {...toast}/>}
      <div style={{background:T.surface,borderBottom:`0.5px solid ${T.border}`,padding:"0 1.5rem",display:"flex",alignItems:"center",justifyContent:"space-between",height:52}}>
        <div style={{display:"flex",alignItems:"center",gap:16}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{width:8,height:8,borderRadius:"50%",background:ROLES[user.role].color}}></div>
            <span style={{fontSize:14,fontWeight:500,color:T.t1}}>Portal de pedidos</span>
          </div>
          <div style={{display:"flex",gap:2}}>
            {["pedidos","usuarios"].map(t=>{ if(t==="usuarios"&&user.role!=="admin") return null;
              return <button key={t} onClick={()=>setTab(t)} style={{fontSize:13,padding:"4px 12px",borderRadius:6,border:"none",cursor:"pointer",background:tab===t?"#EEEDFE":"transparent",color:tab===t?"#3C3489":T.t2,fontWeight:tab===t?500:400}}>{t.charAt(0).toUpperCase()+t.slice(1)}</button>;})}
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:12,color:T.t2}}>{user.name}</span>
          <span style={{background:ROLES[user.role].bg,color:ROLES[user.role].text,fontSize:10,fontWeight:500,padding:"2px 9px",borderRadius:20}}>{ROLES[user.role].label}</span>
          <DarkToggle dark={dark} onToggle={()=>setDark(d=>!d)}/>
          <button onClick={async()=>{await supabase.auth.signOut();setUser(null);setSelected(null);}} style={{fontSize:11,color:T.t2,background:"none",border:`0.5px solid ${T.border}`,borderRadius:6,padding:"4px 10px",cursor:"pointer"}}>Salir</button>
        </div>
      </div>

      <div style={{maxWidth:1100,margin:"0 auto",padding:"1.5rem 1rem"}}>
        {tab==="pedidos"&&<>
          <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:16,alignItems:"center"}}>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar pedido, producto, solicitante…" style={{flex:1,minWidth:200,padding:"8px 12px",borderRadius:8,border:`0.5px solid ${T.border}`,fontSize:13,background:T.surface,color:T.t1}}/>
            <select value={filterEstado} onChange={e=>setFilterEstado(e.target.value)} style={{padding:"8px 10px",borderRadius:8,border:`0.5px solid ${T.border}`,fontSize:13,background:T.surface,color:T.t1}}>
              <option>Todos</option>{ESTADOS.map(e=><option key={e}>{e}</option>)}
            </select>
            <select value={filterCat} onChange={e=>setFilterCat(e.target.value)} style={{padding:"8px 10px",borderRadius:8,border:`0.5px solid ${T.border}`,fontSize:13,background:T.surface,color:T.t1}}>
              <option>Todas</option>{CATEGORIAS.map(c=><option key={c}>{c}</option>)}
            </select>
            {(user.role==="empleado"||user.role==="admin")&&<button onClick={()=>setShowForm(true)} style={BP}>+ Nuevo pedido</button>}
          </div>

          {["admin","proveedor"].includes(user.role)&&(
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:8,marginBottom:16}}>
              {[
                {label:"Pedidos nuevos",  val:orders.filter(o=>o.estado==="Nuevo pedido").length,          bg:"#EEEDFE",text:"#3C3489"},
                {label:"En preparación",  val:orders.filter(o=>o.estado==="En preparación").length,        bg:"#FAEEDA",text:"#633806"},
                {label:"En tránsito",     val:orders.filter(o=>o.estado==="Enviado / en tránsito").length, bg:"#E6F1FB",text:"#0C447C"},
                {label:"Entregados",      val:orders.filter(o=>o.estado==="Entregado").length,             bg:"#EAF3DE",text:"#27500A"},
              ].map(s=><div key={s.label} style={{background:s.bg,borderRadius:10,padding:"12px 14px"}}><div style={{fontSize:11,color:s.text,marginBottom:4}}>{s.label}</div><div style={{fontSize:20,fontWeight:500,color:s.text}}>{s.val}</div></div>)}
            </div>
          )}

          {loading ? <Spinner/> : <>
            {visible.length===0&&<div style={{textAlign:"center",padding:"3rem",color:T.t3,fontSize:14}}>No hay pedidos que mostrar</div>}
            {nuevos.length>0&&(<div style={{marginBottom:24}}>
              <SectionHead label="Nuevos pedidos pendientes" count={nuevos.length} bg="#EEEDFE" border="#AFA9EC" dot="#7F77DD" text="#3C3489" cBg="#3C3489" cText="#EEEDFE" collapsed={collapsed.nuevos} onToggle={()=>toggle("nuevos")} pulsing={true}/>
              {!collapsed.nuevos&&<div style={{display:"flex",flexDirection:"column",gap:8}}>{nuevos.map((o,i)=><OrderRow key={o.id} {...rp(o,i,true)}/>)}</div>}
            </div>)}
            {enCurso.length>0&&(<div style={{marginBottom:24}}>
              <SectionHead label="Pedidos en curso" count={enCurso.length} bg="#E1F5EE" border="#9FE1CB" dot="#1D9E75" text="#085041" cBg="#085041" cText="#E1F5EE" collapsed={collapsed.curso} onToggle={()=>toggle("curso")} pulsing={false}/>
              {!collapsed.curso&&<div style={{display:"flex",flexDirection:"column",gap:8}}>{enCurso.map((o,i)=><OrderRow key={o.id} {...rp(o,i,false,{light:"#E1F5EE",dark:"#C8EFE0",border:"#9FE1CB"})}/>)}</div>}
            </div>)}
            {finalizados.length>0&&(<div>
              <SectionHead label="Finalizados y cancelados" count={finalizados.length} bg="#FAECE7" border="#F0997B" dot="#D85A30" text="#712B13" cBg="#712B13" cText="#FAECE7" collapsed={collapsed.finalizados} onToggle={()=>toggle("finalizados")} pulsing={false}/>
              {!collapsed.finalizados&&<div style={{display:"flex",flexDirection:"column",gap:8,opacity:0.65,filter:"saturate(0.6)"}}>{finalizados.map((o,i)=><OrderRow key={o.id} {...rp(o,i,false,{light:"#FAECE7",dark:"#F5C4B3",border:"#F0997B"})}/>)}</div>}
            </div>)}
          </>}
        </>}

        {tab==="usuarios"&&user.role==="admin"&&<UsersPanel users={users} currentUser={user} T={T} onNew={()=>setUserModal("new")} onEdit={u=>setUserModal(u)} onDelete={deleteUser}/>}
      </div>

      {selected&&<DetailPanel order={selected} user={user} T={T} onClose={()=>setSelected(null)} onUpdate={async ch=>{await updateOrder(selected.id,ch);showToast("Pedido actualizado");}} onDelete={()=>deleteOrder(selected.id)} onChangeEstado={est=>changeEstado(selected.id,est)}/>}
      {showForm&&<NewOrderModal user={user} T={T} onClose={()=>setShowForm(false)} onCreate={async data=>{await createOrder(data);setShowForm(false);}}/>}
      {userModal&&<UserModal userData={userModal==="new"?null:userModal} T={T} onSave={saveUser} onClose={()=>setUserModal(null)}/>}
    </div>
  );
}

function OrderRow({order:o,user,idx,highlight,T,groupColors,onSelect,onChangeEstado}) {
  const next=nextStates(user.role,o.estado);
  let bg,border;
  if (highlight){bg=idx%2===0?"#EEEDFE":"#E4E2F8";border="1.5px solid #7F77DD";}
  else if (groupColors){bg=idx%2===0?groupColors.light:groupColors.dark;border=`1.5px solid ${groupColors.border}`;}
  else{bg=idx%2===0?T.surface:T.surf2;border=`0.5px solid ${T.border}`;}
  return (
    <div style={{background:bg,border,borderRadius:12,padding:"14px 16px",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap",position:"relative",overflow:"hidden"}}>
      {highlight&&<PulseBar/>}
      <div style={{width:72,fontSize:11,fontWeight:500,color:T.t2,flexShrink:0}}>{o.id}</div>
      <div style={{flex:1,minWidth:160}}>
        <div style={{fontSize:14,fontWeight:500,color:highlight?"#3C3489":T.t1}}>{o.producto}</div>
        <div style={{fontSize:11,color:T.t3}}>{o.categoria} · {o.cantidad} ud.{o.precio?` · €${(o.precio*o.cantidad).toLocaleString("es-ES")}`:""}</div>
      </div>
      {["admin","proveedor"].includes(user.role)&&<div style={{fontSize:12,color:T.t2,minWidth:100}}>{o.solicitante}</div>}
      <div style={{minWidth:80}}><Pill estado={o.estado}/></div>
      <div style={{fontSize:11,color:T.t3,minWidth:100}}>{o.estado==="Entregado"&&o.fechaEntrega?<span style={{color:"#27500A",fontWeight:500}}>Entregado {o.fechaEntrega}</span>:o.fechaEstimada?`Est. ${o.fechaEstimada}`:"—"}</div>
      <div style={{display:"flex",gap:6,alignItems:"center"}}>
        {next.length>0&&(
          <select defaultValue="" onChange={e=>{if(e.target.value){onChangeEstado(e.target.value);e.target.value="";}}} onClick={e=>e.stopPropagation()}
            style={{fontSize:11,padding:"4px 8px",borderRadius:8,border:`0.5px solid ${T.border}`,background:T.surface,color:T.t1,cursor:"pointer",maxWidth:180}}>
            <option value="" disabled>→ Cambiar estado</option>
            {next.map(s=>{ const c=ECOLOR[s]; return <option key={s} value={s} style={{background:c.bg,color:c.text}}>→ {s}</option>;})}
          </select>
        )}
        <button onClick={onSelect} style={{fontSize:11,padding:"4px 10px",borderRadius:8,border:`0.5px solid ${T.border}`,background:T.surface,color:T.t1,cursor:"pointer"}}>Ver</button>
      </div>
    </div>
  );
}

function DetailPanel({order:o,user,T,onClose,onUpdate,onDelete,onChangeEstado}) {
  const [editing,setEditing]=useState(false);
  const [form,setForm]=useState({...o});
  const next=nextStates(user.role,o.estado);
  const canEdit=user.role==="admin"||user.role==="proveedor";
  const provKeys=["tracking","fechaEstimada","notas","notasIncidencia"];
  const editable=k=>editing&&(user.role==="admin"||provKeys.includes(k));
  const save=async()=>{await onUpdate(form);setEditing(false);};
  const inp={padding:"8px 10px",borderRadius:8,border:`0.5px solid ${T.border}`,fontSize:13,background:T.surface,color:T.t1,width:"100%"};
  const Field=({label,k,type="text",opts=null})=>(
    <div style={{marginBottom:14}}>
      <div style={{fontSize:11,color:T.t3,marginBottom:4}}>{label}</div>
      {editable(k)?(opts?<select value={form[k]||""} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} style={inp}>{opts.map(v=><option key={v}>{v}</option>)}</select>:type==="textarea"?<textarea value={form[k]||""} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} rows={3} style={{...inp,resize:"vertical",height:"auto"}}/>:<input type={type} value={form[k]||""} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} style={inp}/>):<div style={{fontSize:14,color:T.t1}}>{form[k]||"—"}</div>}
    </div>
  );
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.25)",zIndex:100,display:"flex",justifyContent:"flex-end"}} onClick={onClose}>
      <div style={{width:"100%",maxWidth:480,background:T.surface,height:"100%",overflowY:"auto",padding:"1.5rem",display:"flex",flexDirection:"column",gap:16}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div><div style={{fontSize:16,fontWeight:500,color:T.t1}}>{o.id}</div><div style={{fontSize:12,color:T.t3}}>Solicitado el {o.fechaSolicitud}</div></div>
          <button onClick={onClose} style={{background:"none",border:"none",fontSize:20,cursor:"pointer",color:T.t3}}>✕</button>
        </div>
        <Pill estado={o.estado}/>
        {next.length>0&&(<div><div style={{fontSize:11,color:T.t3,marginBottom:8}}>Cambiar estado</div><div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{next.map(s=>{const c=ECOLOR[s];return <button key={s} onClick={()=>{onChangeEstado(s);setForm(f=>({...f,estado:s}));}} style={{fontSize:12,padding:"5px 12px",borderRadius:20,border:`1px solid ${c.btn}`,background:c.bg,color:c.text,cursor:"pointer",fontWeight:500}}>→ {s}</button>;})}</div></div>)}
        <hr style={{border:"none",borderTop:`0.5px solid ${T.border}`}}/>
        <Field label="Producto" k="producto"/><Field label="Categoría" k="categoria" opts={CATEGORIAS}/><Field label="Cantidad" k="cantidad" type="number"/><Field label="Precio unitario (€)" k="precio" type="number"/>
        {form.precio>0&&<div style={{marginBottom:14}}><div style={{fontSize:11,color:T.t3,marginBottom:4}}>Importe total</div><div style={{fontSize:14,fontWeight:500,color:T.t1}}>€{(form.precio*form.cantidad).toLocaleString("es-ES")}</div></div>}
        <Field label="Solicitante" k="solicitante"/><Field label="Fecha estimada" k="fechaEstimada" type="date"/><Field label="Nº seguimiento / albarán" k="tracking"/><Field label="Notas" k="notas" type="textarea"/>
        {["En garantía / incidencia","Solucionado"].includes(form.estado)&&(
          <div style={{marginBottom:14}}>
            <div style={{fontSize:11,color:"#791F1F",marginBottom:4,fontWeight:500}}>Notas de incidencia / garantía</div>
            {editing?<textarea value={form.notasIncidencia||""} onChange={e=>setForm(f=>({...f,notasIncidencia:e.target.value}))} rows={4} placeholder="Describe el problema…" style={{...inp,resize:"vertical",height:"auto",border:"1px solid #F09595",background:"#FCEBEB"}}/>:<div style={{fontSize:13,color:"#791F1F",background:"#FCEBEB",borderRadius:8,padding:"10px 12px",border:"0.5px solid #F09595",minHeight:60,whiteSpace:"pre-wrap"}}>{form.notasIncidencia||<span style={{opacity:0.5}}>Sin notas de incidencia</span>}</div>}
          </div>
        )}
        <div style={{display:"flex",gap:8,marginTop:"auto",paddingTop:16,borderTop:`0.5px solid ${T.border}`}}>
          {canEdit&&!editing&&<button onClick={()=>setEditing(true)} style={BP}>Editar</button>}
          {editing&&<button onClick={save} style={BP}>Guardar</button>}
          {editing&&<button onClick={()=>{setForm({...o});setEditing(false);}} style={{padding:"8px 14px",borderRadius:8,border:`0.5px solid ${T.border}`,background:T.surface,color:T.t1,fontSize:13,cursor:"pointer"}}>Cancelar</button>}
          {user.role==="admin"&&!editing&&<button onClick={onDelete} style={{padding:"8px 14px",borderRadius:8,border:"0.5px solid #F4C0D1",background:"none",color:"#72243E",fontSize:13,cursor:"pointer"}}>Eliminar</button>}
        </div>
      </div>
    </div>
  );
}

function NewOrderModal({user,T,onClose,onCreate}) {
  const [form,setForm]=useState({producto:"",categoria:"Ordenador",cantidad:1,precio:"",fechaEstimada:"",notas:""});
  const [saving,setSaving]=useState(false);
  const f=(k,v)=>setForm(p=>({...p,[k]:v}));
  const valid=form.producto&&form.cantidad>0;
  const inp={padding:"8px 10px",borderRadius:8,border:`0.5px solid ${T.border}`,fontSize:13,background:T.surface,color:T.t1,width:"100%"};
  const handle=async()=>{ if(!valid) return; setSaving(true); await onCreate(form); setSaving(false); };
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.3)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={onClose}>
      <div style={{background:T.surface,borderRadius:16,padding:"1.75rem",width:"100%",maxWidth:460,maxHeight:"90vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
        <div style={{fontSize:16,fontWeight:500,color:T.t1,marginBottom:20}}>Nuevo pedido</div>
        <div style={{marginBottom:14}}><div style={{fontSize:11,color:T.t3,marginBottom:4}}>Producto</div><input value={form.producto} onChange={e=>f("producto",e.target.value)} placeholder="Ej. MacBook Pro 14&quot;" style={inp}/></div>
        <div style={{marginBottom:14}}><div style={{fontSize:11,color:T.t3,marginBottom:4}}>Categoría</div><select value={form.categoria} onChange={e=>f("categoria",e.target.value)} style={inp}>{CATEGORIAS.map(c=><option key={c}>{c}</option>)}</select></div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
          <div><div style={{fontSize:11,color:T.t3,marginBottom:4}}>Cantidad</div><input type="number" min={1} value={form.cantidad} onChange={e=>f("cantidad",+e.target.value)} style={inp}/></div>
          <div><div style={{fontSize:11,color:T.t3,marginBottom:4}}>Precio (€) · opcional</div><input type="number" min={0} value={form.precio} placeholder="—" onChange={e=>f("precio",+e.target.value)} style={inp}/></div>
        </div>
        <div style={{marginBottom:14}}><div style={{fontSize:11,color:T.t3,marginBottom:4}}>Fecha estimada</div><input type="date" value={form.fechaEstimada} onChange={e=>f("fechaEstimada",e.target.value)} style={inp}/></div>
        <div style={{marginBottom:20}}><div style={{fontSize:11,color:T.t3,marginBottom:4}}>Notas</div><textarea value={form.notas} onChange={e=>f("notas",e.target.value)} rows={3} style={{...inp,resize:"vertical",height:"auto"}}/></div>
        {form.precio>0&&form.cantidad>0&&<div style={{background:"#EEEDFE",borderRadius:8,padding:"10px 14px",marginBottom:16}}><span style={{fontSize:12,color:"#534AB7"}}>Importe total: </span><span style={{fontSize:14,fontWeight:500,color:"#3C3489"}}>€{(form.precio*form.cantidad).toLocaleString("es-ES")}</span></div>}
        <div style={{display:"flex",gap:8}}>
          <button disabled={!valid||saving} onClick={handle} style={{...BP,opacity:valid&&!saving?1:0.5,cursor:valid&&!saving?"pointer":"not-allowed"}}>{saving?"Guardando…":"Crear pedido"}</button>
          <button onClick={onClose} style={{padding:"8px 14px",borderRadius:8,border:`0.5px solid ${T.border}`,background:T.surface,color:T.t1,fontSize:13,cursor:"pointer"}}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

function UsersPanel({users,currentUser,T,onNew,onEdit,onDelete}) {
  const [search,setSearch]=useState("");
  const [confirmId,setConfirmId]=useState(null);
  const visible=users.filter(u=>u.name.toLowerCase().includes(search.toLowerCase())||u.email.toLowerCase().includes(search.toLowerCase()));
  return (
    <div>
      <div style={{display:"flex",gap:10,marginBottom:16,alignItems:"center"}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar usuario…" style={{flex:1,padding:"8px 12px",borderRadius:8,border:`0.5px solid ${T.border}`,fontSize:13,background:T.surface,color:T.t1}}/>
        <button onClick={onNew} style={BP}>+ Nuevo usuario</button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:10}}>
        {visible.map((u,i)=>{ const r=ROLES[u.role]; const isSelf=u.id===currentUser.id; return (
          <div key={u.id} style={{background:i%2===0?T.surface:T.surf2,border:`0.5px solid ${T.border}`,borderRadius:12,padding:"16px"}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
              <Avatar name={u.name} role={u.role} size={40}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:14,fontWeight:500,color:T.t1,display:"flex",alignItems:"center",gap:6}}>{u.name}{isSelf&&<span style={{fontSize:10,background:"#EEEDFE",color:"#3C3489",padding:"1px 6px",borderRadius:20}}>tú</span>}</div>
                <div style={{fontSize:11,color:T.t3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{u.email}</div>
              </div>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{background:r.bg,color:r.text,fontSize:10,fontWeight:500,padding:"2px 8px",borderRadius:20}}>{r.label}</span>
              <div style={{display:"flex",gap:6}}>
                <button onClick={()=>onEdit(u)} style={{fontSize:11,padding:"4px 10px",borderRadius:8,border:`0.5px solid ${T.border}`,background:T.surface,color:T.t1,cursor:"pointer"}}>Editar</button>
                {!isSelf&&(confirmId===u.id?(
                  <div style={{display:"flex",gap:4,alignItems:"center"}}>
                    <span style={{fontSize:11,color:"#72243E"}}>¿Seguro?</span>
                    <button onClick={()=>{onDelete(u.id);setConfirmId(null);}} style={{fontSize:11,padding:"3px 8px",borderRadius:8,border:"0.5px solid #F4C0D1",background:"#FBEAF0",color:"#72243E",cursor:"pointer"}}>Sí</button>
                    <button onClick={()=>setConfirmId(null)} style={{fontSize:11,padding:"3px 8px",borderRadius:8,border:`0.5px solid ${T.border}`,background:T.surface,color:T.t1,cursor:"pointer"}}>No</button>
                  </div>
                ):<button onClick={()=>setConfirmId(u.id)} style={{fontSize:11,padding:"4px 10px",borderRadius:8,border:"0.5px solid #F4C0D1",background:"none",color:"#72243E",cursor:"pointer"}}>Eliminar</button>)}
              </div>
            </div>
          </div>
        );})}
      </div>
    </div>
  );
}

function UserModal({userData,T,onSave,onClose}) {
  const [form,setForm]=useState(userData?{...userData,password:""}:{name:"",email:"",role:"empleado",password:""});
  const [showPwd,setShowPwd]=useState(false);
  const [saving,setSaving]=useState(false);
  const f=(k,v)=>setForm(p=>({...p,[k]:v}));
  const valid=form.name&&form.email&&(userData?true:!!form.password);
  const inp={padding:"8px 10px",borderRadius:8,border:`0.5px solid ${T.border}`,fontSize:13,background:T.surface,color:T.t1,width:"100%"};
  const handleSave=async()=>{ if(!valid) return; setSaving(true); const data={...form}; if(userData&&!form.password) data.password=userData.password; await onSave(data); setSaving(false); };
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.3)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={onClose}>
      <div style={{background:T.surface,borderRadius:16,padding:"1.75rem",width:"100%",maxWidth:440,maxHeight:"90vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
        <div style={{fontSize:16,fontWeight:500,color:T.t1,marginBottom:20}}>{userData?"Editar usuario":"Nuevo usuario"}</div>
        <div style={{marginBottom:14}}><div style={{fontSize:11,color:T.t3,marginBottom:4}}>Nombre completo</div><input value={form.name} onChange={e=>f("name",e.target.value)} placeholder="Nombre completo" style={inp}/></div>
        <div style={{marginBottom:14}}><div style={{fontSize:11,color:T.t3,marginBottom:4}}>Email</div><input type="email" value={form.email} onChange={e=>f("email",e.target.value)} placeholder="correo@empresa.com" style={inp}/></div>
        <div style={{marginBottom:14}}>
          <div style={{fontSize:11,color:T.t3,marginBottom:4}}>Contraseña{userData&&<span style={{fontWeight:400}}> · dejar vacío para no cambiar</span>}</div>
          <div style={{position:"relative"}}>
            <input type={showPwd?"text":"password"} value={form.password} onChange={e=>f("password",e.target.value)} placeholder={userData?"••••••••":"Nueva contraseña"} style={{...inp,paddingRight:40}}/>
            <button onClick={()=>setShowPwd(p=>!p)} style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",fontSize:14,color:T.t3}}>{showPwd?"🙈":"👁️"}</button>
          </div>
        </div>
        <div style={{marginBottom:20}}><div style={{fontSize:11,color:T.t3,marginBottom:4}}>Rol</div><select value={form.role} onChange={e=>f("role",e.target.value)} style={inp}>{Object.entries(ROLES).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select></div>
        {form.role&&<div style={{background:ROLES[form.role].bg,borderRadius:8,padding:"10px 14px",marginBottom:16,display:"flex",alignItems:"center",gap:8}}><Avatar name={form.name||"?"} role={form.role} size={32}/><div><div style={{fontSize:13,fontWeight:500,color:ROLES[form.role].text}}>{form.name||"Nombre del usuario"}</div><div style={{fontSize:11,color:ROLES[form.role].text,opacity:0.8}}>{ROLES[form.role].label}</div></div></div>}
        <div style={{display:"flex",gap:8}}>
          <button disabled={!valid||saving} onClick={handleSave} style={{...BP,opacity:valid&&!saving?1:0.5,cursor:valid&&!saving?"pointer":"not-allowed"}}>{saving?"Guardando…":userData?"Guardar cambios":"Crear usuario"}</button>
          <button onClick={onClose} style={{padding:"8px 14px",borderRadius:8,border:`0.5px solid ${T.border}`,background:T.surface,color:T.t1,fontSize:13,cursor:"pointer"}}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}