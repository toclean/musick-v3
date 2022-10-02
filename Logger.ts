import * as dotenv from 'dotenv' // see https://github.com/motdotla/dotenv#how-do-i-use-dotenv-with-import
dotenv.config()

const DEBUG = process.env.DEBUG ?? true;

export class Logger {
    static debug(content: any) {
        if (!DEBUG) return;
        console.debug(content);
    }
}