import chalk from 'chalk';

const kvPairs = process.argv.slice(2).map(p => p.split('='));

export class ParamType {
    static String = new ParamType('String');
    static Boolean = new ParamType('Boolean');
    static Integer = new ParamType('Integer');
    static Float = new ParamType('Float');
    static Path = new ParamType('Path');

    /**
     * Creates a ParamType
     * @param {string} type 
     */
    constructor(type) {
        this.type = type;
    }

    toString() {
        return this.type;
    }
}

export class Param {
    /**
     * Finds this param in the kvPairs and retrieves the raw value string.
     * @returns {string?}
     */
    #getRawValue = () => {
        for (const kv of kvPairs) {
            const key = kv[0];
            const val = kv.length === 2 ? kv[1] : true;
            if (key === this.compName) {
                return val;
            }
        }
        return null;
    };

    /**
     * If there's no rawValue and it's required, throw.
     * @param {string} rawValue 
     */
    #checkRequired = (valRaw) => {
        if (valRaw === null && this.isRequired) {
            throw new Error(chalk.red(`${this.name} is marked as required, but was not found!`));
        }
    };

    #parseBool = (valRaw) => (valRaw === 'false' ? false : !!valRaw);

    #parseInt = (valRaw) => {
        this.#checkRequired(valRaw);
        return valRaw === null
            ? null
            : parseInt(valRaw);
    };

    #parseFloat = (valRaw) => {
        this.#checkRequired(valRaw);
        return valRaw === null
            ? null
            : parseFloat(valRaw, 10);
    };

    #parseString = (valRaw) => {
        this.#checkRequired(valRaw);
        return valRaw === null
            ? null
            : valRaw;
    };

    #parsePath = (valRaw) => {
        this.#checkRequired(valRaw);
        return valRaw === null
            ? null
            : valRaw + '.' + this.fileType;
    };

    #parser = () => {
        throw new Error(`${this.name}: Parser was not defined!`);
    };

    /**
     * Parses this parameter from process.argv.
     * @returns {*}
     */
    parse = () => {
        const valRaw = this.#getRawValue() || this.defaultVal;
        return this.#parser(valRaw);
    };

    /**
     * Generates a parameter
     * @param {string} name 
     * @param {ParamType} type 
     * @param {{alias: string, isRequired: boolean, defaultVal: *, override: function}} options 
     */
    constructor(name, type, options = {}) {
        const {
            alias,
            isRequired,
            defaultVal,
            override,
            flag,
            fileType,
        } = options;
        this.compName = '-' + name;
        this.name = name;
        this.type = type;
        this.alias = alias || name;
        this.isRequired = isRequired;
        this.defaultVal = defaultVal;
        this.override = override;
        this.flag = flag;
        this.fileType = fileType;
        if (type === ParamType.Boolean && isRequired) {
            throw new Error(`Param ${name}: It is impossible to have a required boolean.`);
        }

        switch (this.type) {
            case ParamType.Boolean:
                this.#parser = this.#parseBool;
                break;
            case ParamType.Integer:
                this.#parser = this.#parseInt;
                break;
            case ParamType.Float:
                this.#parser = this.#parseFloat;
                break;
            case ParamType.String:
                this.#parser = this.#parseString;
                break;
            case ParamType.Path:
                this.#parser = this.#parsePath;
                break;
            default:
                throw new Error(`Unrecognized type for ${this.name}: ${this.type}`);
        }
    }
}

/**
 * Parses the parameters
 * @param {[Param]} params - The parameters.
 * @returns {{}} - Returns a list of objects and their values.
 */
export const getParams = (params) => params
    .reduce((acc, param) => {
        const value = param.parse();
        if (value !== null) {
            acc[param.alias] = value;
            if (param.override) {
                param.override(acc);
            }
            if (param.flag) {
                const str = param.flag(param.name.toUpperCase() + ' MODE ACTIVATED');
                console.log(chalk.bold(chalk.blackBright(str)));
            }
        }
        return acc;
    }, {});
