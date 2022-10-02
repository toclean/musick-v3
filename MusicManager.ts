import { AudioPlayer, AudioPlayerStatus, createAudioPlayer, createAudioResource, DiscordGatewayAdapterCreator, entersState, getVoiceConnection, joinVoiceChannel, NoSubscriberBehavior, VoiceConnection, VoiceConnectionStatus } from '@discordjs/voice';
import { search } from 'youtube-search-without-api-key';
import { stream } from 'play-dl';
import { Client, CommandInteraction, Guild, GuildMember, VoiceChannel } from 'discord.js';

export interface Song {
    id: {
        videoId: string;
    };
    url: string;
    title: string;
    description: string;
    duration_raw: number;
    snippet: {
        url: string;
        duration: any;
        publishedAt: string;
        thumbnails: {
            id: string;
            url: string;
            default: string;
            high: string;
            height: number;
            width: number;
        };
        title: string;
        views: number;
    };
    views: number;
}

export type SongRequest = Song & { author: GuildMember };

export class MusicManager {
    queue: SongRequest[] = [];
    player: AudioPlayer | undefined;
    guildId: string | undefined;
    currentSongIndex: number = 0;
    client: Client | undefined;

    public initialize(client: Client, guildId: string) {
        try {
            if (!client) throw Error('')
    
            this.currentSongIndex = 0;
            this.guildId = guildId;
            this.queue = [];
            this.client = client;
        } catch (e) {
            console.error(e);
            throw e;
        }
    }

    private resume() {
        try {
            this.player?.unpause();
        } catch (e) {
            console.error(e);
            throw e;
        }
    }

    private pause() {
        try {
            this.player?.pause();
        } catch (e) {
            console.error(e);
            throw e;
        }
    }

    public skip() {
        try {
            this.player?.stop();
        } catch (e) {
            console.error(e);
            throw e;
        }
    }

    private async lookupSong(query: string): Promise<Song | undefined> {
        const songResults = await search(query);

        return songResults[0];
    }

    async play(command: CommandInteraction): Promise<void> {
        try {
            if (!this.guildId) throw Error('MusicManager is not initialized. Call initialize()');

            const songToPlay = this.queue[this.currentSongIndex];

            const audioStream = await stream(songToPlay.url);

            let resource = createAudioResource(audioStream.stream, {
                inputType: audioStream.type,
                inlineVolume: true,
            });
            
            resource.volume?.setVolume(0.1);

            this.player = createAudioPlayer({
                behaviors: {
                    noSubscriber: NoSubscriberBehavior.Play,
                }
            });

            this.player.play(resource);

            this.player.on('stateChange', async (oldState, newState) => {
                if (newState.status === AudioPlayerStatus.Idle) {
                    this.currentSongIndex += 1;
                    if (this.currentSongIndex + 1 > this.queue.length) return;
                    await this.play(command);
                }
            });

            let vc = getVoiceConnection(this.guildId);

            if (!vc || vc.state.status === VoiceConnectionStatus.Destroyed || vc.state.status === VoiceConnectionStatus.Disconnected) {
                vc = await this.joinVoice(songToPlay.author.id);

                if (!vc || vc.state.status === VoiceConnectionStatus.Destroyed || vc.state.status === VoiceConnectionStatus.Disconnected) {
                    throw Error('Could not get voice connection. Good luck!');
                }
            }

            vc.subscribe(this.player);
            
            await command.channel!.send('Now playing: ' + songToPlay.title);
        } catch (e) {
            console.error(e);
            throw e;
        }
    }

    async joinVoice(memberId: string): Promise<VoiceConnection | undefined> {
        try {
            if (!this.client) throw Error('No client was provided at initialization!');
            if (!this.guildId) throw Error('No guildId was provided at initialization!');

            const guild = this.client.guilds.cache.get(this.guildId);
            if (!guild) return;

            const member = guild.members.cache.get(memberId);
            if (!member) return;

            const voiceChannel = member.voice.channel;
            let connection: VoiceConnection;
            if (voiceChannel as VoiceChannel) {
                connection = joinVoiceChannel({
                    channelId: voiceChannel?.id ?? '',
                    guildId: guild.id,
                    adapterCreator: guild.voiceAdapterCreator as unknown as DiscordGatewayAdapterCreator,
                });

                connection.on(VoiceConnectionStatus.Disconnected, async (oldState, newState) => {
                    try {
                        await Promise.race([
                            entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
                            entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
                        ]);
                        // Seems to be reconnecting to a new channel - ignore disconnect
                    } catch (error) {
                        // Seems to be a real disconnect which SHOULDN'T be recovered from
                        connection.destroy();
                    }
                });

                return connection;
            }
        } catch (e) {
            console.error(e);
            throw e;
        }
    }

    async attemptPlay(command: CommandInteraction) {
        // Check if there is currently a song player (i.e. check if there is a player and that it is not in the idle state)
        if (!this.player) {
            await this.play(command);
            return;
        }

        if (this.player.state.status === AudioPlayerStatus.Paused || this.player.state.status === AudioPlayerStatus.AutoPaused) {
            this.resume();
            return;
        }

        if (this.player.state.status === AudioPlayerStatus.Idle) {
            this.player.stop();
            await this.play(command);
        }

        if (this.player.state.status === AudioPlayerStatus.Buffering) {
            // Should probably tell the user the player is buffering
        }
    }

    async addSong(query: string, command: CommandInteraction): Promise<string | undefined> {
        const song = await this.lookupSong(query);
        if (!song) throw Error('Failed to find song using query: ' + query);

        this.queue.push({
            ...song,
            author: command.member as GuildMember,
        });

        await this.attemptPlay(command);

        return song.title;
        // // Logic to play the song here
        // const stream = await playdl.stream(song.url);

        // let resource = createAudioResource(stream.stream, {
        //     inputType: stream.type,
        //     inlineVolume: true,
        // });

        // resource.volume?.setVolume(0.1);

        // musicManager.player = createAudioPlayer({
        //     behaviors: {
        //         noSubscriber: NoSubscriberBehavior.Play,
        //     }
        // });

        // try {
        //     musicManager.player.play(resource);
        //     const vc = getVoiceConnection(interaction.guild.id);

        //     if (!vc || vc.state.status === VoiceConnectionStatus.Destroyed || vc.state.status === VoiceConnectionStatus.Disconnected) {
        //         return await interaction.editReply('SOMETHING WENT REALLY BAD...');
        //     }

        //     vc.subscribe(musicManager.player);

        //     await interaction.editReply('Now Playing: ' + this.title);
        // } catch (e) {
        //     console.error(e);
        // }
    }
}