import fs from 'fs';
import chalk from 'chalk';
import { Player } from './player.js';

const green = str => console.log(chalk.green(str));
const red = str => console.log(chalk.red(str));
const blue = str => console.log(chalk.blue(str));
const yellow = str => console.log(chalk.yellow(str));
const magenta = str => console.log(chalk.magenta(str));
const white = str => console.log(chalk.white(str));
const bold = str => console.log(chalk.bold(str));

export class Encounter {
    static EarlyBattles = [
        new Encounter('LF vs LRC (LIVE)',
        'LF',
        {
            trader_light_frigate: 6,
        },
        'LRC',
        {
            trader_long_range_cruiser: 5,
        }),
        
        // new Encounter('LF vs LRC (TEST)',
        // 'LF',
        // {
        //     trader_light_frigate: 8,
        // },
        // 'LRC',
        // {
        //     trader_long_range_cruiser: 5,
        // }),

        // new Encounter('LF vs Flak',
        // 'LF',
        // {
        //     trader_light_frigate: 4,
        // },
        // 'Flak',
        // {
        //     trader_npc_antifighter_frigate: 5,
        // })
    ];

    /**
     * Constructor
     * @param {string} name 
     * @param {string} n1 name 1
     * @param {{*}} f1 fleet config 1
     * @param {string} n2 name 2
     * @param {{*}} f2 fleet config 2
     */
    constructor(name, n1, f1, n2, f2) {
        this.name = name;
        this.n1 = n1;
        this.f1 = f1;
        this.n2 = n2;
        this.f2 = f2;
    }

    /**
     * Creates a promise that waits for n ms
     * @param {number} ms 
     * @returns {Promise}
     */
    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    /**
     * Executes a simulation run.
     * @param {Encounter} battle
     * @param {{*}} shipDict 
     * @param {number} simRuns 
     */
    async exec (shipDict, simRuns) {
        blue('Simulating ' + this.name);
        const p1 = new Player(shipDict, this.f1, 10000, -1, this.n1, chalk.yellow);
        const p2 = new Player(shipDict, this.f2, -10000, 1, this.n2, chalk.magentaBright);
        
        const simDuration = 600;// n seconds
        const simInterval = 100;// Tick every n ms
        const ticksPerSecond = Math.floor(1000 / simInterval);
        const simTicks = simDuration * 1000 / simInterval;
        let totalExecTicks = 0;
        
        // Repeat simulation for better data.
        for (let j = 0; j < simRuns; j++) {
            bold(`\n==================================\nExecuting Simulation Iteration = ${j}`);
            // Run simulation
            for (let i = 0; i < simTicks; i++) {
                // if (i % (ticksPerSecond) === 0) bold(`Tick [${i}/${simTicks}] (${i * simInterval / 1000 }s)`);

                p1.fleet.forEach(ship => ship.act(p1.fleet, p2.fleet, simInterval));
                p2.fleet.forEach(ship => ship.act(p2.fleet, p1.fleet, simInterval));

                p1.fleet = p1.fleet.filter(ship => !ship.isDead);
                p2.fleet = p2.fleet.filter(ship => !ship.isDead);

                if (p1.fleet.every(ship => ship.isDead)) {
                    console.log(p2.color(this.n2 + ' Wins after ' + (i * simInterval / 1000 ) + 's'));
                    p2.wins++;
                    p2.fleet.forEach(survivor => survivor.printHealth(1));
                    totalExecTicks += i;
                    break;
                }
                if (p2.fleet.every(ship => ship.isDead)) {
                    console.log(p1.color(this.n1 + ' Wins after ' + (i * simInterval / 1000 ) + 's'));
                    p1.wins++;
                    p1.fleet.forEach(survivor => survivor.printHealth(1));
                    totalExecTicks += i;
                    break;
                }

                // Run simulation at a speedup.
                // const speedup = 10;
                // await sleep(simInterval / speedup);
            }
            p1.reset();
            p2.reset();
        }
        const avgTime = totalExecTicks * simInterval / (1000 * simRuns);
        bold(`\n==================================\nAverage ${this.name} Duration: ${avgTime}s`);
        bold(this.n1 + ' Wins: ' + p1.wins);
        bold(this.n2 + ' Wins: ' + p2.wins);

        // Compile results
        const table = [
            ['Player'],
            ['Dealt'],
            ['Tanked'],
            ['Performance'],
            ['Supply'],
            ['Credits'],
            ['Metal'],
            ['Crystal'],
            ['Resources'],
            ['PPS'],
            ['PPR']
        ];
        const r1 = p1.getResults(simRuns);
        const r2 = p2.getResults(simRuns);
        const compile = (results) => {
            Object.keys(results).forEach((key, i) => {
                table[i].push(isNaN(results[key]) ? results[key] : Math.round(results[key] * 100) / 100);
            });
        };
        compile(r1);
        compile(r2);
        console.table(table);
    }
}