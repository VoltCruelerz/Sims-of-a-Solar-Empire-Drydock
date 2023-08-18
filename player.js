import Ship from "./ship.js";

export class Player {
    /**
     * Each key is a ship type with a value that is an int.
     * @param {{*}} shipDict
     * @param {{*}} shipObj
     */
    constructor(shipDict, shipObj) {
        this.ships = [];
        const keys = Object.keys(shipObj);
        keys.forEach(key => {
            const count = shipObj[key];
            const shipConfig = shipDict[key];
            if (!shipConfig) {
                console.error('Unrecognized ship type: ' + key);
                return;
            }
            for (let i = 0; i < count; i++) {
                this.ships.push(new Ship(shipConfig));
            }
        });
    }
}