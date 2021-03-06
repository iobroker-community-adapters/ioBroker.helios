"use strict";
const utils = require("@iobroker/adapter-core");
const axios = require("axios");
const http = require("http");
const datapoints = require("./datapoints");
class Helios extends utils.Adapter {
    constructor(options) {
        super({
            ...options,
            name: "helios",
        });
        this.on("ready", this.onReady.bind(this));
        this.on("stateChange", this.onStateChange.bind(this));
        this.on("unload", this.onUnload.bind(this));
    }

    async onReady() {
        this.setState("info.connection", false, true);
        if (this.config.interval <= 10) {
            this.log.info("Set interval to minimum 10");
            this.config.interval = 10;
        }
        this.createdDPs = {};
        this.requestClient = axios.create({ httpAgent: new http.Agent({ keepAlive: true }) });
        this.subscribeStates("*");
        this.ignorePage = [];
        this.completeArray = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 931];
        this.updateArray = [3, 4, 8, 12, 16];
        if (this.config.updateArray) {
            this.updateArray = this.config.updateArray.replace(/ /g, "").split(",");
        }

        if (!this.config.ip || !this.config.password) {
            this.log.warn("Please enter ip and password");
            return;
        }
        this.headers = {
            Accept: "*/*",
            "Accept-Language": "de,en-US;q=0.7,en;q=0.3",
            "Content-Type": "text/plain;charset=UTF-8",
            Referer: "http://" + this.config.ip + "/",
            DNT: "1",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.193 Safari/537.36",
        };
        await this.login();
        await this.updateKWL(this.completeArray);
        this.updateInterval = setInterval(async () => {
            await this.updateKWL(this.updateArray);
        }, this.config.interval * 1000);
        this.refreshTokenInterval = setInterval(() => {
            this.login();
        }, 5 * 60 * 1000); //5 Minutes
    }
    async login() {
        await this.requestClient({
            method: "post",
            url: "http://" + this.config.ip + "/info.htm",
            headers: this.headers,
            data: "v00402=" + this.config.password,
        })
            .then((res) => {
                this.log.debug(res.data);
                this.setState("info.connection", true, true);
            })
            .catch((error) => {
                this.setState("info.connection", false, true);
                this.log.error(error);
                error.response && this.log.error(JSON.stringify(error.response.data));
            });
    }

    async updateKWL(statusArray) {
        for (const element of statusArray) {
            if (this.ignorePage.includes(element)) {
                return;
            }
            await this.sleep(500); //wait to prevent a ECONNRESET
            await this.requestClient({
                method: "post",
                url: "http://" + this.config.ip + "/data/werte" + element + ".xml",
                headers: this.headers,
                data: "xml=/data/werte" + element + ".xml",
            })
                .then((res) => {
                    this.log.debug(JSON.stringify(res.data));
                    this.parseResult(res.data);
                })
                .catch((error) => {
                    if (error.response && error.response.status === 401) {
                        this.log.info("Receive 401 error. Refresh Token in 30 seconds");
                        clearTimeout(this.refreshTokenTimeout);
                        this.refreshTokenTimeout = setTimeout(() => {
                            this.login();
                        }, 1000 * 30);
                        return;
                    }
                    if (error.response && error.response.status === 404) {
                        this.ignorePage.push(element);
                        this.log.info("Ignore Page " + element + " because no information found");
                    }
                    this.log.error("Page: " + element);
                    this.log.error(error);
                    error.response && this.log.error(JSON.stringify(error.response.data));
                });
        }
    }
    async parseResult(xml) {
        const regex = /<ID>(?<ID>v\d{5})<\/ID>\s*?<VA>(?<VALUE>.*?)<\/VA>/gm;
        const elements = this.matchAll(regex, xml);
        for (const element of elements) {
            let { ID, VALUE } = element.groups;
            let type = "mixed";
            if (!ID) {
                this.log.warn("Empty ID");
                this.log.warn(xml);
                return;
            }
            if (VALUE !== "" && Number(VALUE) !== NaN) {
                VALUE = Number(VALUE);
                type = "number";
            }
            let dataObject = {
                Beschreibung: ID,
                Zugriff: "RW",
                Variable: ID,
                Bemerkung: "",
            };
            if (datapoints[ID]) {
                dataObject = datapoints[ID];
            }
            const path = dataObject.Beschreibung.replace(/ /g, "_").replace(/\./g, "");
            if (!this.createdDPs[ID]) {
                const writable = dataObject.Zugriff === "R" ? false : true;
                const common = {
                    name: dataObject.Bemerkung,
                    role: "state",
                    variable: dataObject.Variable,
                    type: type,
                    write: writable,
                    read: true,
                };
                if (dataObject.Min) {
                    common.min = dataObject.Min;
                }
                if (dataObject.Max) {
                    common.max = dataObject.Max;
                }

                await this.setObjectNotExistsAsync(path, {
                    type: "state",
                    common: common,
                    native: {},
                })
                    .then(() => {
                        this.createdDPs[ID] = true;
                    })
                    .catch((error) => {
                        this.log.error(error);
                    });
            }
            this.setState(path, VALUE, true).catch((error) => {
                this.log.error(ID);
                this.log.error(JSON.stringify(dataObject));
                this.log.error(error);
            });
        }
    }
    matchAll(re, str) {
        let match;
        const matches = [];
        while ((match = re.exec(str))) {
            matches.push(match);
        }
        return matches;
    }
    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
    onUnload(callback) {
        try {
            this.setState("info.connection", false, true);
            clearInterval(this.updateInterval);
            clearInterval(this.refreshTokenInterval);
            clearTimeout(this.refreshTokenTimeout);
            callback();
        } catch (e) {
            callback();
        }
    }

    async onStateChange(id, state) {
        if (state) {
            if (!state.ack) {
                const object = await this.getObjectAsync(id);
                const variable = object.common.variable;
                this.log.debug(variable + "=" + state.val);
                await this.requestClient({
                    method: "post",
                    url: "http://" + this.config.ip + "/info.htm",
                    headers: this.headers,
                    data: variable + "=" + state.val,
                })
                    .then((res) => {
                        this.log.debug(JSON.stringify(res.data));
                        return res.data;
                    })
                    .catch((error) => {
                        this.log.error(error);
                        if (error.response) {
                            this.log.error(JSON.stringify(error.response.data));
                        }
                    });
                clearTimeout(this.refreshTimeout);
                this.refreshTimeout = setTimeout(async () => {
                    await this.updateKWL(this.completeArray);
                }, 10 * 1000);
            }
        }
    }
}

if (require.main !== module) {
    module.exports = (options) => new Helios(options);
} else {
    new Helios();
}
