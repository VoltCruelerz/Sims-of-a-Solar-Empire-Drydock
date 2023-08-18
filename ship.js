export class Ship {
    /**
     * Creates a ship
     * @param {{
     * name: string,
     * ai: {*},
     * target: number,
     * weapons: [{*}],
     * hull: number,
     * shields: number,
     * mitigation: number,
     * armor: number
     * }} shipConfig
     * @param {number} position the starting position
     * @param {number} direction +/- 1 
     * @param {string} id The ID of the ship
     * @param {*} factionColor The chalk color of the faction
     */
    constructor(shipConfig, position, direction, id, factionColor) {
        // Create a clone of the config.
        const data = JSON.parse(JSON.stringify(shipConfig));
        const keys = Object.keys(data);
        keys.forEach(key => {
            this[key] = data[key];
        });
        this.weapons.forEach(weapon => {
            weapon.cooldownRemaining = 0;
        });
        this.maxShields = this.shields;
        this.maxHull = this.hull;
        this.isDead = false;
        this.position = position;
        this.direction = direction;
        this.id = id;
        this.factionColor = factionColor;
        this.tanked = 0;
        this.dealt = 0;
    }

    /**
     * Take its turn
     * @param {[Ship]} enemyFleet 
     * @param {number} tickInterval 
     */
    act(enemyFleet, tickInterval) {
        this.selectTarget(enemyFleet);
        this.moveToTarget(tickInterval);
        this.attack(tickInterval);
    }

    /**
     * Gets the maximum range of this ship's weapons.
     * @returns {number}
     */
    getMaxRange() {
        return this.weapons.max(p => p.range);
    }

    /**
     * Checks if this outranges the other ship.
     * @param {Ship} otherShip 
     * @returns {boolean}
     */
    outRanges(otherShip) {
        return this.getMaxRange() > otherShip.getMaxRange();
    }

    /**
     * Checks absolute distance to target
     * @returns {number}
     */
    getDistanceToTarget(target = this.target) {
        return Math.abs(this.position - target.position);
    }

    /**
     * Checks if a weapon is in range
     * @param {{range: number}} weapon 
     * @param {Ship} target 
     * @returns {boolean}
     */
    weaponInRange(weapon, target = this.target) {
        return weapon.range >= this.getDistanceToTarget(target);
    }

    /**
     * Checks if all onboard weapons can hit the target.
     * @returns {boolean}
     */
    allWeaponsCanHit(target = this.target) {
        return this.weapons.every(weapon => this.weaponInRange(weapon, target));
    }

    /**
     * Selects the next target from the hostile fleet
     * @param {[Ship]} hostileFleet 
     */
    selectTarget(hostileFleet) {
        // First, attempt to find a target in range
        const targetsInRange = hostileFleet.filter(enemyShip => this.allWeaponsCanHit(enemyShip));

        // If no target is in range, move to the best new target
        const targetOptions = targetsInRange.length > 0 ? targetsInRange : hostileFleet;

        // Choose a target from among those listed, defaulting to the previous target.
        this.target = !this.target || this.target.isDead
            ? null
            : this.target;
        this.targetPriority = !this.target || this.target.isDead
            ? Number.MIN_SAFE_INTEGER
            : this.targetPriority;
        targetOptions.forEach((opt) => {
            let priority = opt.aiTarget.attack_priority;
            priority += this.getTargetOptionSpecialPriority(opt);

            if (priority > this.targetPriority) {
                this.print(`Prioritizing New Target: ${opt.id} with priority ${priority}`);
                this.target = opt;
                this.targetPriority = priority;
            }
        });
    }

    getTargetOptionSpecialPriority(targetOption) {
        const priorities = this.ai.priority_bonus_per_attack_target_type;
        const bonus = (targetOption.aiTarget.attack_target_types || []).reduce((sum, type) => {
            sum += priorities[type] || 0
            return sum;
        }, 0);
        return bonus;
    }

    /**
     * Sets the target to the provided ship.
     * @param {Ship} targetShip 
     */
    setTarget(targetShip) {
        this.target = targetShip;
    }

    /**
     * Moves toward a target ship until we're in range.
     * @param {number} tickInterval - The number of ms to simulate passing.
     */
    moveToTarget(tickInterval) {
        const tickDistance = this.speed * tickInterval / 1000;
        if (!this.allWeaponsCanHit()) {
            if (this.getDistanceToTarget() < this.speed) {
                this.position = this.position + (this.getDistanceToTarget() * this.direction);
            } else {
                this.position = this.position + (this.speed * this.direction);
            }
            this.print('Moved to ' + this.position);
        }
    }

    /**
     * This ship attacks its target
     * @param {number} tickInterval 
     */
    attack(tickInterval) {
        this.weapons.forEach(weapon => this.fire(weapon, tickInterval));
    }

    /**
     * Attempts to fire a given weapon.
     * @param {{
     * damage: number,
     * cooldown: number,
     * range: number,
     * ap: number,
     * cooldownRemaining: number
     * }} weapon The weapon to attempt to fire or reload
     * @param {number} tickInterval 
     */
    fire(weapon, tickInterval) {
        if (weapon.cooldownRemaining <= 0) {
            // The weapon is ready to fire, so check range to target.
            if (this.weaponInRange(weapon)) {
                this.print('Firing ' + weapon.name);
                this.dealt += this.target.takeDamage(weapon.damage, weapon.ap);
                weapon.cooldownRemaining += weapon.cooldown * 1000;
            }
        } else {
            // The simulation tick is not infinitely small, so allow this to temporarily
            // go negative.
            weapon.cooldownRemaining = weapon.cooldownRemaining - tickInterval;
        }
    }

    /**
     * Deals damage to the ship
     * @param {number} damage 
     * @param {number} piercing 
     * @returns {number} the actual damage dealt, across both shields and hull, after mitigation and armor
     */
    takeDamage(damage, piercing) {
        this.tanked += damage;
        let dealt = 0;
        if (this.shields > 0) {
            damage -= this.mitigation;
            damage = Math.max(0, damage);
            if (damage > this.shields) {
                dealt += this.shields;
            } else {
                dealt += damage;
            }
            this.shields -= damage;
            damage = 0;
        }
        if (this.shields < 0) {
            damage = -this.shields;
            this.shields = 0;
        }
        if (damage > 0) {
            const armorDiff = Math.max(0, this.armor - piercing);
            const afterArmor = damage / (1 + (0.01 * armorDiff));
            this.hull -= afterArmor;
            if (this.hull < 0) {
                dealt += this.hull + afterArmor;
            } else {
                dealt += afterArmor;
            }
        }
        this.printHealth(1);
        if (this.hull <= 0) {
            this.isDead = true;
            this.print('DEAD');
        }
        console.log('Dealt: ' + dealt);
        return dealt;
    }

    printHealth(depth = 0) {
        this.print(`Shields ${this.shields}/${this.maxShields}, Hull ${this.hull}/${this.maxHull}`, depth);
    }

    print(str, depth = 0) {
        str = `- ${this.factionColor(this.id)}: ${str}`;
        str = str.padStart(str.length + 4 * depth, ' ');
        console.log(str);
    }
}