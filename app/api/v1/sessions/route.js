import {NextResponse} from "next/server";
import {describeAgent,networkLabel} from "@/lib/session-display";
import prisma from "@/lib/prisma";
import {currentUser} from "@/lib/session-auth";
const json=(data,status=200)=>NextResponse.json(data,{status,headers:{"Cache-Control":"no-store"}});
export async function GET(request){
 const user=await currentUser(request);if(!user)return json({error:"Unauthorized"},401);
 try {
 const rows=await prisma.userSession.findMany({where:{userId:user.id},orderBy:{createdAt:"desc"},take:100,select:{id:true,sessionToken:true,ipAddress:true,userAgent:true,deviceInfo:true,mfaVerified:true,isActive:true,createdAt:true,lastActiveAt:true,expiresAt:true,revokedAt:true}});
  const grants=await prisma.auditLog.findMany({where:{userId:user.id,action:"OAUTH_CONSENT_APPROVED"},select:{metadata:true,client:{select:{clientName:true,clientId:true}}},orderBy:{createdAt:'desc'},take:1000});
 const links=await prisma.sessionAccessLog.findMany({where:{userId:user.id,userSessionId:{in:rows.map(s=>s.id)},authSessionId:{not:null}},select:{userSessionId:true,client:{select:{clientName:true,clientId:true}}},take:1000});return json({sessions:rows.map(({sessionToken,...s})=>({...s,agent:describeAgent(s.userAgent),network:networkLabel(s.ipAddress),apps:Array.from(new Map([...grants.filter(g=>g.metadata?.ssoSessionId===s.id).map(g=>g.client),...links.filter(l=>l.userSessionId===s.id).map(l=>l.client)].filter(Boolean).map(c=>[c.clientId,c.clientName])).values()),current:sessionToken===request.cookies.get('sso_session')?.value,active:s.isActive&&s.expiresAt>new Date()}))});
 } catch(error) { console.error("Session listing failed",error); return json({error:"โหลดเซสชันไม่สำเร็จ"},500); }
}
export async function DELETE(request){
 const user=await currentUser(request);if(!user)return json({error:"Unauthorized"},401);
 const {id,others}=await request.json();if(!others&&typeof id!=="string")return json({error:"Invalid session"},400);
 const token=request.cookies.get('sso_session')?.value;
 const result=await prisma.$transaction(async tx=>{
 const sessions=await tx.userSession.findMany({where:{userId:user.id,...(others?{sessionToken:{not:token}}:{id})},select:{id:true,sessionToken:true}});
 if(!others&&!sessions.length)return null;
 const ids=sessions.map(s=>s.id);
 const grants=await tx.auditLog.findMany({where:{userId:user.id,action:"OAUTH_CONSENT_APPROVED"},select:{authSessionId:true,metadata:true}});
 const authIds=grants.filter(g=>ids.includes(g.metadata?.ssoSessionId)).map(g=>g.authSessionId).filter(Boolean);
 const issued=await tx.auditLog.findMany({where:{userId:user.id,action:"OAUTH_TOKEN_ISSUED",authSessionId:{in:authIds}},select:{metadata:true}});
 const tokenIds=issued.map(i=>i.metadata?.tokenId).filter(id=>typeof id==='string');
 await tx.oAuthToken.updateMany({where:{userId:user.id,id:{in:tokenIds}},data:{isRevoked:true,revokedAt:new Date(),revokedReason:"SSO session revoked"}});
 const changed=await tx.userSession.updateMany({where:{id:{in:ids},isActive:true},data:{isActive:false,revokedAt:new Date(),revokedReason:"Revoked by account owner"}});
 await tx.auditLog.create({data:{userId:user.id,action:"SESSIONS_REVOKED",category:"SESSION",metadata:{sessionIds:ids,count:changed.count}}});
 return {current:sessions.some(s=>s.sessionToken===token),count:changed.count};
 });
 if(!result)return json({error:"Session not found"},404);
 const response=json(result);if(result.current)response.cookies.delete('sso_session');return response;
}



