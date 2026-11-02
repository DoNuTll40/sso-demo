import {NextResponse} from "next/server";
import prisma from "@/lib/prisma";
import {currentUser} from "@/lib/session-auth";
export async function GET(request){
 const user=await currentUser(request);if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const params=new URL(request.url).searchParams;
 const page=Math.max(1,Math.min(10000,Number(params.get('page'))||1));
 const all=params.get('scope')==='all';if(all&&user.role!=='ADMIN')return NextResponse.json({error:"Forbidden"},{status:403});
 const where=all?{}:{userId:user.id};
 const [events,total]=await prisma.$transaction([prisma.auditLog.findMany({where,orderBy:[{createdAt:'desc'},{id:'desc'}],skip:(page-1)*25,take:25,select:{id:true,createdAt:true,action:true,status:true,category:true,ipAddress:true,userAgent:true,reason:true,user:{select:{username:true}},client:{select:{clientName:true}}}}),prisma.auditLog.count({where})]);
 return NextResponse.json({events,total,page},{headers:{'Cache-Control':'no-store'}});
}
