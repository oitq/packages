import {createServer} from "vite";
import * as path from 'path'
import vue from '@vitejs/plugin-vue';
import {default as koaStatic} from 'koa-static'
import {Middleware} from 'koa'
import {Service} from "oitq";
export async function install(service:Service,config:{env:string}={env:'development'}){
    const {env}=config||{env:'development'}
    const isProd=env!=='development'
    async function createMiddleware():Promise<Middleware>{
        if(isProd) return koaStatic(path.resolve(__dirname,'../dist'))
        const viteServer=await createServer({
            root:path.resolve(__dirname,'../'),
            server:{
                middlewareMode:true
            },
            plugins:[vue()]
        })
        service.on('dispose',()=>{
            viteServer.close()
        })
        return (ctx,next)=>{
            return new Promise<void>(async (resolve, reject) => {
                viteServer.middlewares(ctx.req, ctx.res, (err: Error) => (err ? reject(err) : resolve(next())))
            })
        }
    }
    service.app.koa.use(await createMiddleware())
}