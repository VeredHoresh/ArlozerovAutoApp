const pushButton = document.querySelector('#push-notifications');
const pushStatus = document.querySelector('#push-status');
let pushConfig, pushSyncing = false;
const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && isSecureContext;
function pushKey(value) { return Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0)); }
async function syncPushState() {
  if (!pushSupported()) { pushButton.disabled=true; pushStatus.textContent='התראות אינן נתמכות בדפדפן הזה. באנדרואיד מומלץ לפתוח ב־Chrome.'; return; }
  if (!state.connected) { pushButton.disabled=true; pushStatus.textContent='להפעלת התראות יש להיכנס לחשבון.'; pushConfig=null; return; }
  if (pushSyncing) return;
  pushSyncing=true;pushButton.disabled=true;
  try {
    pushConfig=await api('push/config');
    pushButton.textContent=pushConfig.enabled?'כיבוי התראות בטלפון הזה':'הפעלת התראות בטלפון הזה';
    pushStatus.textContent=Notification.permission==='denied'?'ההתראות חסומות. אפשר לאפשר אותן בהגדרות האתר בדפדפן.':pushConfig.enabled?'יתקבלו התראות על אישור הרשמה, רשימת המתנה או כישלון.':'קבלת תוצאות ההרשמה גם כשהאפליקציה סגורה.';
  } catch (e) { pushStatus.textContent=heText(e.message); }
  finally { pushSyncing=false;pushButton.disabled=!state.connected; }
}
pushButton.onclick=async()=>{
  pushButton.disabled=true;
  try {
    if (!pushConfig) throw new Error('יש להיכנס לחשבון ולנסות שוב.');
    if (!pushConfig.enabled) {
      const permission=await Notification.requestPermission();
      if(permission!=='granted'){pushStatus.textContent=permission==='denied'?'ההתראות חסומות. יש לאפשר אותן בהגדרות האתר.':'ההתראות לא הופעלו. אפשר לנסות שוב בכל עת.';return;}
      const registration=await navigator.serviceWorker.ready;
      const subscription=await registration.pushManager.getSubscription() || await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:pushKey(pushConfig.publicKey)});
      await api('push/subscription',{method:'POST',body:JSON.stringify(subscription)});
      toast('ההתראות הופעלו בטלפון הזה.');
    } else {
      await api('push/subscription',{method:'DELETE'});
      const subscription=await(await navigator.serviceWorker.ready).pushManager.getSubscription();
      if(subscription)await subscription.unsubscribe();
      toast('ההתראות כובו בטלפון הזה.');
    }
    await syncPushState();
  } catch(e){pushStatus.textContent=heText(e.message);}
  finally{pushButton.disabled=false;}
};
window.addEventListener('accountstate',syncPushState);
syncPushState();
