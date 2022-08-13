import {Service,Bot,deepMerge} from "oitq";
import {OneBot} from "./onebot";
import {OneBotConfig,defaultOneBotConfig} from "./config";
declare module 'oitq'{
    interface Bot{
        oneBot?:OneBot
    }
    namespace Bot{
        interface Options{
            oneBot?:boolean|OneBotConfig
        }
    }
}
export function install(service:Service){
    async function startOneBot(bot:Bot){
        bot.oneBot=new OneBot(service.app,bot as any,typeof bot.options.oneBot==='boolean'?defaultOneBotConfig:deepMerge(defaultOneBotConfig,bot.options.oneBot))
        bot.on('message',(data)=>bot.oneBot.dispatch(data))
        bot.on('notice',(data)=>bot.oneBot.dispatch(data))
        bot.on('request',(data)=>bot.oneBot.dispatch(data))
        bot.on('system',(data)=>bot.oneBot.dispatch(data))
        await bot.oneBot.start()
    }
    service.on('start',()=>{
        for(const bot of service.app.bots){
            startOneBot(bot)
        }
        service.on('bot-add',async (bot:Bot)=>{
            if(bot.options.oneBot){
                startOneBot(bot)
            }
        })
        service.on('bot-remove',(bot:Bot)=>{
            if(bot.oneBot){
                bot.oneBot.stop()
            }
        })
        service.on('dispose',()=>{
            for(const bot of service.app.bots){
                if(bot.oneBot) bot.oneBot.stop()
            }
        })
    })
    if(service.app.started)service.emit('start',)
}
