import {createApp} from './app.js';
if(!process.env.ADMIN_TOKEN || process.env.ADMIN_TOKEN.length<20){
 console.error('Set a strong ADMIN_TOKEN in the service environment'); process.exit(1);
}
const {server,db}=createApp();
server.listen(Number(process.env.PORT||3522),'127.0.0.1',()=>console.log('good-thoughts listening on loopback'));
process.on('SIGTERM',()=>server.close(()=>{db.close();process.exit(0);}));
