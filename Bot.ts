import { Client, ClientOptions } from "discord.js";
import { MusicManager } from "./MusicManager";

export class Bot extends Client {
    musicManager: MusicManager;

    constructor(options: ClientOptions) {
        super(options);
        this.musicManager = new MusicManager();
    }
}