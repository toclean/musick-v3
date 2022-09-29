import { AudioPlayer, AudioPlayerStatus, createAudioResource, VoiceConnectionStatus, NoSubscriberBehavior, createAudioPlayer, getVoiceConnection } from "@discordjs/voice";
import { CommandInteraction, User } from "discord.js";
import * as dotenv from 'dotenv' // see https://github.com/motdotla/dotenv#how-do-i-use-dotenv-with-import
import { search } from "youtube-search-without-api-key";
import playdl from 'play-dl';
import { joinVoice } from "./index";

dotenv.config()

const DEBUG = process.env.DEBUG ?? true;

interface SearchResult {
    id: {
        videoId: any;
    };
    url: string;
    title: string;
    description: string;
    duration_raw: number;
    snippet: {
        url: string;
        duration: any;
        publishedAt: any;
        thumbnails: {
            id: any;
            url: any;
            default: any;
            high: any;
            height: any;
            width: any;
        };
        title: string;
        views: number;
    };
    views: number;
}

// Move this object to its own class in the future
export class Song implements SearchResult {
    id: { videoId: any; };
    url: string;
    title: string;
    description: string;
    duration_raw: number;
    snippet: { url: string; duration: any; publishedAt: any; thumbnails: { id: any; url: any; default: any; high: any; height: any; width: any; }; title: string; views: any; };
    views: number;
    requester: User;

    constructor(searchResult: SearchResult, requester: User) {
        this.id = searchResult.id;
        this.url = searchResult.url;
        this.title = searchResult.title;
        this.description = searchResult.description;
        this.duration_raw = searchResult.duration_raw;
        this.snippet = searchResult.snippet;
        this.views = searchResult.views;
        this.requester = requester;
    }

    async play(musicManager: MusicManager, interaction: CommandInteraction) {
        if (!interaction.guild) throw Error('Not connected to a guild!');

        await joinVoice(interaction);

        // Logic to play the song here
        const stream = await playdl.stream(this.url);

        let resource = createAudioResource(stream.stream, {
            inputType: stream.type,
            inlineVolume: true,
        });

        resource.volume?.setVolume(0.1);

        musicManager.player = createAudioPlayer({
            behaviors: {
                noSubscriber: NoSubscriberBehavior.Play,
            }
        });

        try {
            musicManager.player.play(resource);
            const vc = getVoiceConnection(interaction.guild.id);

            if (!vc || vc.state.status === VoiceConnectionStatus.Destroyed || vc.state.status === VoiceConnectionStatus.Disconnected) {
                return await interaction.editReply('SOMETHING WENT REALLY BAD...');
            }

            vc.subscribe(musicManager.player);

            await interaction.editReply('Now Playing: ' + this.title);
        } catch (e) {
            console.error(e);
        }
    }
}

export class Queue<T> extends Array<T> {
    constructor() {
        super();
    }

    static create<T>(): Queue<T> {
        return Object.create(Queue.prototype);
    }

    add(songs: T[] | T): number {
        if (Array.isArray(songs)) {
            this.push(...songs);
        } else {
            this.push(songs);
        }

        return this.length;
    }

    next(): T | undefined {
        this.shift();
        return this.at(0);
    }

    peek(): T | undefined {
        return this.at(0);
    }
}

export class MusicManager {
    queue: Queue<Song>;
    player: AudioPlayer | undefined;

    constructor() {
        this.queue = Queue.create<Song>();
        this.queue.next();
    }

    async skip(interaction: CommandInteraction) {
        if (!this.player) throw Error('No song currently playing!');

        if (this.player.state.status === AudioPlayerStatus.Playing) {
            this.player.stop();
        }

        const nextSong = this.queue.next();

        if (nextSong) {
            return await nextSong.play(this, interaction);
        }
    }

    async search(interaction: CommandInteraction) {
        if (!interaction.guildId || interaction.guildId === '') {
            await interaction.editReply('Not in a guild!');
            return Promise.reject();
        }

        const option = interaction.options.get('query', true);
        const { name, value: searchQuery } = option;

        if (!searchQuery || typeof searchQuery !== 'string') {
            await interaction.editReply('Invalid search query!');
            return Promise.reject();
        }

        if (DEBUG) console.log('SEARCH QUERY: ' + searchQuery);

        let searchResults = await search(searchQuery);
        if (searchResults && searchResults.length > 5) searchResults = searchResults.slice(0, 5);

        if (DEBUG) console.table(searchResults);

        // const vettedResults = vetSearch(searchQuery, searchResults);

        // if (DEBUG) console.table(vettedResults);

        const songInQuestion = searchResults[0]; // vettedResults[0];

        console.log('FOUND: ' + songInQuestion.title);

        return new Song(songInQuestion, interaction.user);
    }

    async play(interaction: CommandInteraction) {
        const song = await this.search(interaction);

        if (this.player?.state.status === AudioPlayerStatus.Paused) {
            const unpauseSuccess = this.player.unpause();

            if (!unpauseSuccess) throw new Error('Failed to unpause the player!');
        }

        this.queue.add(song);
        await interaction.editReply('Added: ' + song.title);

        if (!this.player || this.player.state.status === AudioPlayerStatus.Idle) {
            await song.play(this, interaction);
            this.player?.on('stateChange', async (oldState, newState) => {
                if (newState.status === AudioPlayerStatus.Idle) {
                    await this.skip(interaction);
                }
            });
        }
    }
}