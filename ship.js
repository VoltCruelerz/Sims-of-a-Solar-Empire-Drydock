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
     */
    constructor(shipConfig, position, direction, id) {
        // Create a clone of the config.
        const data = JSON.parse(JSON.stringify(shipConfig));
        const keys = Object.keys(data);
        keys.forEach(key => {
            this.key = data[key];
        });
        this.maxShields = this.shields;
        this.maxHull = this.hull;
        this.isDead = false;
        this.position = position;
        this.direction = direction;
        this.id = id;
    }

    /**
     * Take its turn
     * @param {[Ship]} enemyFleet 
     * @param {number} tickInterval 
     */
    act(enemyFleet, tickInterval) {
        // If we need a target, pick one.
        if (!this.target || !this.target.isDead) {
            this.selectTarget(enemyFleet);
        }
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
    getDistanceToTarget() {
        return Math.abs(this.position - this.target.position);
    }

    /**
     * Checks if all onboard weapons can hit the target.
     * @returns {boolean}
     */
    allWeaponsCanHit() {
        return this.weapons.every(weapon => weapon.range >= this.getDistanceToTarget());
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

        // Choose a target from among those listed.
        let bestShip = null;
        let bestPriority = Number.MIN_SAFE_INTEGER;
        targetOptions.forEach((opt) => {
            let priority = opt.attack_priority;
            priority += this.getTargetOptionSpecialPriority(opt);

            if (!bestShip) {
                bestShip = opt;
                bestPriority = priority;
            }
        });
        this.target = bestShip;
    }

    getTargetOptionSpecialPriority(targetOption) {
        const priorities = this.ai.priority_bonus_per_attack_target_type;
        const bonus = targetOption.ai_attack_target.attack_target_types.reduce((sum, type) => {
            sum += priorities[type] || 0
            return sum;
        }, 0);
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
        // The weapon is ready to fire!
        if (!cooldownRemaining) {
            this.print('Firing ' + weapon.name + '!');
            this.target.takeDamage(weapon.damage, weapon.ap);
            weapon.cooldownRemaining = weapon.cooldown * 1000;
        } else {
            weapon.cooldownRemaining = Math.max(0, weapon.cooldownRemaining - tickInterval);
        }
    }

    /**
     * Deals damage to the ship
     * @param {number} damage 
     * @param {number} piercing 
     */
    takeDamage(damage, piercing) {
        if (this.shields > 0) {
            damage -= this.mitigation;
            damage = Math.max(0, damage);
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
        }
        if (this.hull <= 0) {
            this.isDead = true;
        }
        this.print(`Shields ${this.shields}/${this.maxShields}, Hull ${this.hull}/${this.maxHull}`);
    }

    print(str) {
        console.log(`- ${this.id}: ${str}`);
    }
}