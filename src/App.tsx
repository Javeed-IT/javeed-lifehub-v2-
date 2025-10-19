
import React, { useEffect, useMemo, useState } from "react";

type Txn = { id: string; date: string; type: "income" | "expense"; category: string; amount: number; note?: string; };
type HealthEntry = { id: string; date: string; weightKg?: number; sleepHrs?: number; steps?: number; mood?: "😀" | "🙂" | "😐" | "😕" | "😞"; };
type Meal = { id: string; date: string; mealType: "Breakfast" | "Lunch" | "Dinner" | "Snack"; name: string; calories?: number; };
type Task = { id: string; title: string; due?: string; done: boolean; recur?: "none" | "daily" | "weekly"; area?: "Finance" | "Health" | "Diet" | "Life" | "Career"; };
type Note = { id: string; text: string; pinned?: boolean; created: string };
type ReadingItem = { id: string; title: string; status: "finished" | "current" | "upcoming"; };

type Store = {
  txns: Txn[]; health: HealthEntry[]; meals: Meal[]; tasks: Task[]; notes: Note[];
  emergencyFundTarget: number; emergencyFundName: string; emergencyFundBalance: number; monthlyExpenseBaseline: number;
  budgets: Record<string, number>; // target by category
  nightShiftMode: boolean;
  weeklyHabits: { weekStart: string; gym: boolean[]; swim: boolean[]; water: number[]; callFamily: boolean[]; };
  reading: ReadingItem[];
};

const KEY = "lifehub.v2.javeed";
const CATS = ["Rent","Food/Grocery","Phone Bill","Transport","Gym","Restaurants","Other"] as const;
const startOfWeek = (d: Date) => { const x=new Date(d); const day=(x.getDay()+6)%7; x.setDate(x.getDate()-day); x.setHours(0,0,0,0); return x; };
const fmtGBP = (n: number) => new Intl.NumberFormat("en-GB",{style:"currency", currency:"GBP"}).format(n);
const monthKey = (d: Date)=> `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;

function useStore(): [Store, (s: Store) => void] {
  const blank: Store = {
    txns: [], health: [], meals: [], tasks: [], notes: [],
    emergencyFundTarget: 2000, emergencyFundName: "Emergency Fund", emergencyFundBalance: 0, monthlyExpenseBaseline: 1000,
    budgets: { "Rent":800, "Food/Grocery":250, "Phone Bill":30, "Transport":80, "Gym":25, "Restaurants":60, "Other":100 },
    nightShiftMode: true,
    weeklyHabits: { weekStart: startOfWeek(new Date()).toISOString().slice(0,10), gym:Array(7).fill(false), swim:Array(7).fill(false), water:Array(7).fill(0), callFamily:Array(7).fill(false) },
    reading: [
      { id: crypto.randomUUID(), title: "Clear Thinking", status: "finished" },
      { id: crypto.randomUUID(), title: "The Psychology of Money", status: "finished" },
      { id: crypto.randomUUID(), title: "Atomic Habits", status: "current" },
      { id: crypto.randomUUID(), title: "Deep Work", status: "upcoming" }
    ]
  };
  const [store, setStore] = useState<Store>(()=>{ try{ const raw=localStorage.getItem(KEY); return raw?{...blank, ...JSON.parse(raw)}:blank;}catch{return blank;}});
  useEffect(()=>{ localStorage.setItem(KEY, JSON.stringify(store)); },[store]);
  return [store, setStore];
}

const Section: React.FC<{ title: string; right?: React.ReactNode; className?: string }>=({title,right,className,children})=>(
  <section className={`mb-6 ${className??""}`}>
    <div className="flex items-center justify-between mb-3"><h2 className="text-xl font-semibold">{title}</h2>{right}</div>
    <div className="bg-white/70 dark:bg-zinc-900/60 rounded-2xl shadow p-4">{children}</div>
  </section>
);
const Chip: React.FC<{label:string}>=({label})=> <span className="text-xs px-2 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700">{label}</span>;
const TabButton: React.FC<{active:boolean; onClick:()=>void; label:string}>=({active,onClick,label})=>(<button onClick={onClick} className={`px-3 py-2 rounded-xl text-sm font-medium border ${active?"bg-zinc-900 text-white border-zinc-900":"bg-white dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700"}`}>{label}</button>);
const ProgressBar: React.FC<{value:number;max:number}>=({value,max})=>{ const pct=Math.min(100,Math.max(0,(value/max)*100||0)); return <div className="w-full h-3 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden"><div className="h-3 bg-emerald-500" style={{width:pct+"%"}}/></div>};
const download=(filename:string,content:string,type="text/plain")=>{ const blob=new Blob([content],{type}); const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=filename; a.click(); URL.revokeObjectURL(url); };

export default function App(){
  const [store, setStore] = useStore();
  const [tab, setTab] = useState<"Home"|"Finance"|"Budgets"|"Health"|"Diet"|"Plan"|"Career"|"Reading"|"Notes">("Home");
  const [dark, setDark] = useState(true);

  useEffect(()=>{ document.documentElement.classList.toggle("dark",dark); document.documentElement.classList.add("bg-zinc-50","dark:bg-zinc-950"); },[dark]);

  // ---- Finance aggregates ----
  const now = new Date();
  const mk = monthKey(now);
  const monthTxns = useMemo(()=> store.txns.filter(t=> t.date?.startsWith(mk) && t.type==="expense"), [store.txns, mk]);
  const spendByCat = useMemo(()=> {
    const map: Record<string, number> = {};
    for (const c of CATS) map[c]=0;
    for (const t of monthTxns) map[t.category] = (map[t.category]||0) + Math.abs(t.amount);
    return map;
  }, [monthTxns]);
  const totals = useMemo(()=>{
    const income = store.txns.filter(t=>t.type==="income").reduce((a,b)=>a+b.amount,0);
    const expense = store.txns.filter(t=>t.type==="expense").reduce((a,b)=>a+b.amount,0);
    return { income, expense, net: income - expense };
  },[store.txns]);

  // ---- Emergency fund ----
  const sixMonthTarget = store.monthlyExpenseBaseline*6;
  const sixMonthsAchieved = store.emergencyFundBalance >= sixMonthTarget;

  // ---- Drafts ----
  const [txnDraft,setTxnDraft]=useState<Partial<Txn>>({date:new Date().toISOString().slice(0,10), type:"expense", category:"General", amount:0});
  const [quickCatAmount,setQuickCatAmount]=useState<Record<string, number>>({});
  const [efAdjust,setEfAdjust]=useState<number>(0);

  // ---- Actions ----
  const addTxn=()=>{
    if (!txnDraft.amount || !txnDraft.date || !txnDraft.type || !txnDraft.category){ alert("Fill amount, date, type, category"); return; }
    const t: Txn = { id: crypto.randomUUID(), date: txnDraft.date!, type: txnDraft.type!, category: txnDraft.category!, amount: Number(txnDraft.amount), note: txnDraft.note };
    setStore({ ...store, txns: [t, ...store.txns] });
    setTxnDraft({ date: new Date().toISOString().slice(0,10), type:"expense", category:"General", amount: 0 });
  };
  const addExpenseForCategory=(cat:string, amt:number)=>{
    if (!amt || amt<=0) return;
    const t: Txn = { id: crypto.randomUUID(), date: new Date().toISOString().slice(0,10), type:"expense", category: cat, amount: amt, note: "Quick add" };
    setStore({ ...store, txns: [t, ...store.txns] });
    setQuickCatAmount({ ...quickCatAmount, [cat]: 0 });
  };
  const exportCSV=()=>{
    const header=["date","type","category","amount","note"];
    const rows=store.txns.map(t=>[t.date,t.type,t.category,t.amount,(t.note||"").replaceAll('"','""')]);
    const csv=[header,...rows].map(r=> r.map(x=> typeof x==="string"?`"${x}"`:x).join(",")).join("\\n");
    download(`lifehub-transactions-${new Date().toISOString().slice(0,10)}.csv`,csv,"text/csv");
  };

  return (
    <div className="min-h-dvh text-zinc-900 dark:text-zinc-100">
      <header className="sticky top-0 z-10 backdrop-blur bg-white/60 dark:bg-zinc-950/60 border-b border-zinc-200 dark:border-zinc-800">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <span className="text-2xl">💫</span>
          <div className="flex-1">
            <h1 className="text-lg font-bold">LifeHub — Javeed</h1>
            <p className="text-xs opacity-70">Budgets + Categories • {mk}</p>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn" onClick={()=>setDark(!dark)}>{dark?"Light":"Dark"} mode</button>
            <button className="btn" onClick={()=>download(`lifehub-backup-${new Date().toISOString().slice(0,10)}.json`, JSON.stringify(store,null,2), "application/json")}>Export</button>
            <button className="btn" onClick={exportCSV}>Export CSV</button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        <div className="flex gap-2 mb-5 flex-wrap">
          {["Home","Finance","Budgets","Health","Diet","Plan","Career","Reading","Notes"].map((t)=> (
            <TabButton key={t} label={t} active={tab===t} onClick={()=>setTab(t as any)} />
          ))}
        </div>

        {tab==="Home" && (
          <div className="grid md:grid-cols-2 gap-6">
            <Section title="Emergency Fund">
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <div className="text-xs opacity-70 mb-1">{store.emergencyFundName}</div>
                  <div className="text-2xl font-bold">{fmtGBP(store.emergencyFundBalance)} / {fmtGBP(store.emergencyFundTarget)}</div>
                  <div className="mt-2"><ProgressBar value={store.emergencyFundBalance} max={store.emergencyFundTarget} /></div>
                  {sixMonthsAchieved && <div className="mt-2 text-xs bg-emerald-600/20 rounded px-2 py-1 inline-block">🎉 Six months secured!</div>}
                </div>
                <div className="space-y-2">
                  <input className="input" type="number" placeholder="Adjust (e.g., 50 or -20)" value={efAdjust} onChange={e=> setEfAdjust(Number(e.target.value))} />
                  <div className="flex gap-2">
                    <button className="btn" onClick={()=> setStore({...store, emergencyFundBalance: Math.max(0, store.emergencyFundBalance + Number(efAdjust||0))})}>Apply</button>
                    <button className="btn" onClick={()=> setEfAdjust(0)}>Clear</button>
                  </div>
                  <input className="input" type="number" placeholder="Monthly expenses baseline" value={store.monthlyExpenseBaseline} onChange={e=> setStore({...store, monthlyExpenseBaseline:Number(e.target.value)})} />
                  <div className="text-xs opacity-70">Six months target: <b>{fmtGBP(sixMonthTarget)}</b></div>
                </div>
              </div>
            </Section>

            <Section title="Net cash (all transactions)">
              <div className="text-2xl font-bold">{fmtGBP(totals.net)}</div>
              <div className="text-sm mt-1">Income {fmtGBP(totals.income)} • Spend {fmtGBP(totals.expense)}</div>
            </Section>
          </div>
        )}

        {tab==="Finance" && (
          <div className="grid md:grid-cols-2 gap-6">
            <Section title="Add transaction">
              <div className="grid sm:grid-cols-2 gap-3">
                <input className="input" type="date" value={txnDraft.date||""} onChange={e=>setTxnDraft({...txnDraft, date:e.target.value})} />
                <select className="input" value={txnDraft.type} onChange={e=>setTxnDraft({...txnDraft, type:e.target.value as any})}>
                  <option value="income">Income</option>
                  <option value="expense">Expense</option>
                </select>
                <select className="input" value={txnDraft.category} onChange={e=>setTxnDraft({...txnDraft, category:e.target.value})}>
                  {([...CATS] as string[]).map(c=> <option key={c} value={c}>{c}</option>)}
                </select>
                <input className="input" placeholder="Amount" type="number" step="0.01" value={txnDraft.amount?.toString()||""} onChange={e=>setTxnDraft({...txnDraft, amount:Number(e.target.value)})} />
                <input className="input sm:col-span-2" placeholder="Note (optional)" value={txnDraft.note||""} onChange={e=>setTxnDraft({...txnDraft, note:e.target.value})} />
              </div>
              <div className="mt-3 flex gap-2">
                <button className="btn" onClick={addTxn}>Add</button>
                <button className="btn" onClick={exportCSV}>Export CSV</button>
              </div>
            </Section>

            <Section title={`Quick add — ${mk}`}>
              <div className="grid sm:grid-cols-2 gap-3">
                {CATS.map(c=> (
                  <div key={c} className="flex items-center gap-2">
                    <div className="w-28 text-sm">{c}</div>
                    <input className="input w-28" type="number" placeholder="£" value={quickCatAmount[c]||""} onChange={e=> setQuickCatAmount({...quickCatAmount, [c]: Number(e.target.value)})} />
                    <button className="btn" onClick={()=> addExpenseForCategory(c, Number(quickCatAmount[c]||0))}>Add</button>
                    <div className="text-xs opacity-70 ml-auto">{fmtGBP(spendByCat[c]||0)} / {fmtGBP(store.budgets[c]||0)}</div>
                  </div>
                ))}
              </div>
            </Section>
          </div>
        )}

        {tab==="Budgets" && (
          <div className="grid md:grid-cols-2 gap-6">
            <Section title={`This month — ${mk}`}>
              <div className="space-y-3">
                {CATS.map(c=> {
                  const spent = spendByCat[c]||0; const target = store.budgets[c]||0;
                  const over = spent>target && target>0;
                  return (
                    <div key={c}>
                      <div className="flex justify-between text-sm mb-1">
                        <div>{c}</div>
                        <div>{fmtGBP(spent)} / {fmtGBP(target)}</div>
                      </div>
                      <div className={`h-3 rounded-full overflow-hidden ${over?"ring-2 ring-rose-500":""}`}>
                        <div className={`${over?"bg-rose-500":"bg-emerald-500"}`} style={{width: `${Math.min(100, target? (spent/target)*100 : 0)}%`, height:"100%"}} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Section>

            <Section title="Set / change budgets">
              <div className="space-y-2">
                {CATS.map(c=> (
                  <div key={c} className="flex items-center gap-2">
                    <div className="w-32 text-sm">{c}</div>
                    <input className="input w-32" type="number" value={store.budgets[c]||0} onChange={e=> setStore({...store, budgets:{...store.budgets, [c]: Number(e.target.value)}})} />
                  </div>
                ))}
                <div className="text-xs opacity-70">Tip: Budgets are monthly. The progress bar turns red if you go over.</div>
              </div>
            </Section>
          </div>
        )}
      </main>
    </div>
  );
}
