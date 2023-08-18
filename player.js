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
                const shipId = `${id}_${key}_${i}`;
                this.fleet.push(new Ship(shipConfig, startingPosition, direction, shipId, factionColor));
            }
        });
    }
}