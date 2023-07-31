import * as readline from "node:readline/promises";
import puppeteer from "puppeteer";


class App {

    page!: puppeteer.Page;
    browser!: puppeteer.Browser;

    constructor() {
        this.main();
    }

    async main() {
        const { userName, password } = await this.getUserInput();
        const { browser, page } = await this.startBrowser();
        this.browser = browser;
        this.page = page;
        await this.login(userName, password);
        await this.attendance();
        await this.cleanup();
    }

    async getUserInput() {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        const userName = await rl.question("Enter your email: ");
        const password = await rl.question("Enter your password: ");
        return { userName, password };
    }

    async startBrowser() {
        const browser = await puppeteer.launch({ headless: "new", defaultViewport: null, args: ['--start-maximized'] })

        const page = await browser.newPage();

        await page.goto("https://pwhr.darwinbox.in/");

        return { browser, page };
    }

    async login(userName: string, password: string) {
        console.log("Logging in.")
        const usernameEl = await this.page.waitForSelector(".username-field");
        const passwordEl = await this.page.waitForSelector(".password-field");
        const submitBtn = await this.page.waitForSelector("#login-submit");

        if (!usernameEl || !passwordEl || !submitBtn) {
            throw new Error("Unable to find login elements");
        }

        await usernameEl.type(userName);
        await passwordEl.type(password);

        await submitBtn.click();

        await this.page.waitForNavigation();
        console.log("Logged in...")
    }

    async attendance() {
        console.log("Finding absent days...");

        await Promise.all([
            this.page.goto("https://pwhr.darwinbox.in/attendance/index/index/view/list", { waitUntil: "networkidle2" }),
            this.page.waitForNavigation()
        ]);

        await this.page.waitForSelector(".odd");
        await this.page.waitForSelector(".even");

        const areDaysLeft = await this.page.evaluate(async () => { // Runs in the browser context
            function sleep(time: number) {
                return new Promise((resolve) => {
                    setTimeout(resolve, time);
                });
            }

            const attendanceColor = "#f44336";
            const alreadyRequestedColor = "#999999";
            const odd = document.querySelectorAll(".odd");
            const even = document.querySelectorAll(".even");
            const days = [...odd, ...even];

            const absentDays = days.filter(day => day.classList.contains(attendanceColor) && !day.classList.contains(alreadyRequestedColor));
            
            if (absentDays.length === 0) { // base condition for recursion
                return false;
            }

            for await (const day of absentDays) {
                console.log("day", day);
                day.getElementsByTagName("a")[0].click();

                await sleep(5000);

                const reason = document.querySelector(".item[data-value='a632bfc73cd1d8']") as HTMLDivElement;
                reason.click();

                const attendanceMessage = document.querySelector("#AttendanceRequestForm_message") as HTMLTextAreaElement;
                attendanceMessage.value = "Missed punch";

                const submitBtn = document.querySelector("#add_request_btn") as HTMLInputElement;
                submitBtn.click();
                return true;
            }
        });

        console.log("Submitted attendance for a day...");

        if (areDaysLeft) {
            await this.attendance();
        }
        console.log("Marked attendance for all days...");
    }

    async cleanup() {
        console.log("Cleaning up...");
        await this.browser.close();
        console.log("Bye.")
        process.exit(0);
    }

}


const app = new App();