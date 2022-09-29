import { beforeEach, describe } from "mocha";
import { Queue, Song } from "../MusicManager";
import { expect } from 'chai';

const exampleSong = {} as Song;

describe('Queue', () => {
    let queue: Queue<Song>;

    beforeEach(() => {
        queue = Queue.create<Song>();
    });

    describe('constructor', () => {
        it('should initialize the queue', () => {
            expect(queue.length).to.be.eq(0);
        });
    });

    describe('add', () => {
        it('should add a song to the queue', () => {
            queue.add(exampleSong);

            expect(queue.length).to.be.eq(1);
        });

        it('should add multiple songs to the queue', () => {
            queue.add([exampleSong, exampleSong, exampleSong]);

            expect(queue.length).to.be.eq(3);
        });
    });

    describe('next', () => {
        beforeEach(() => {
            queue.add(exampleSong);
        });

        it('should remove the current song from the queue', () => {
            const prevSong = queue.next();

            expect(prevSong).to.be.eq(exampleSong);
            expect(queue.length).to.be.eq(0);
        });
    });
});