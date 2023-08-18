import { Ship } from "./ship.js";

export class Player {
    /**
     * Each key is a ship type with a value that is an int.
     * @param {{*}} shipDict the dictionary of ship names to ship types
     * @param {{*}} fleetDefinition keys are ship types, values are number of each
     * @param {number} startingPosition
     * @param {number} direction +/- 1
     * @param {string} id 
     * @param {*} factionColor The chalk faction color
     */
    constructor(shipDict, fleetDefinition, startingPosition, direction, id, factionColor) {
        this.id = id;

        this.fleet = [];
        const keys = Object.keys(fleetDefinition);
        keys.forEach(key => {
            const count = fleetDefinition[key];
            const shipConfig = shipDict[key];
            if (!shipConfig) {
                console.error('Unrecognized ship type: ' + key);
                return;
            }
            for (let i = 0; i < count; i++) {
                const shipId = `${id}[${key}][${i}]`;
                this.fleet.push(new Ship(shipConfig, startingPosition, direction, shipId, factionColor));
            }

            // Create a shallow copy so we can track performance after the fact.
            this.originalFleet = this.fleet.map(ship => ship);
        });
    }

    getResults() {
        const sum = (arr) => arr.reduce((sum, item) => sum + item, 0);
        const dealt = sum(this.originalFleet.map(p => p.dealt));
        const tanked = sum(this.originalFleet.map(p => p.tanked));
        const supply = sum(this.originalFleet.map(p => p.supply));
        const credits = sum(this.originalFleet.map(p => p.credits));
        const metal = sum(this.originalFleet.map(p => p.metal));
        const crystal = sum(this.originalFleet.map(p => p.crystal));
        const performance = dealt + tanked;
        const resources = credits + metal + crystal;

        const pps = performance / supply;
        const ppr = performance / resources;

        return {
            id: this.id,
            dealt,
            tanked,
            performance,
            supply,
            credits,
            metal,
            crystal,
            resources,
            pps,
            ppr
        };
    }
}