import * as readline from "node:readline/promises";
import puppeteer from "puppeteer";
import "dotenv/config";

class App {

    page!: puppeteer.Page;
    browser!: puppeteer.Browser;

    async requestAttendance() {
        await this.getInputAndLogin();
        await this.viewSignOff();
        await this.startRequestAttendance(false);
        await this.startRequestAttendance(true);
        await this.cleanup();
    }

    async approveAttendance() {
        try {
            await this.getInputAndLogin();
            await this.viewSignOff();
            await this.startApproveAttendance();
            await this.cleanup();
        } catch (e) {
            console.error('Fatt gya bro', e);
        }
    }

    async getUserInput() {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        const userName = process.env.EMAIL_ID ?? await rl.question("Enter your email: ");
        const password = process.env.PASSWORD ?? await rl.question("Enter your password: ");
        console.log("userName", userName);
        return { userName, password };
    }

    async startBrowser() {
        const browser = await puppeteer.launch({ headless: "new", devtools: false, defaultViewport: null, args: ['--start-maximized'] })

        const page = await browser.newPage();

        await page.goto("https://pwhr.darwinbox.in/");

        return { browser, page };
    }

    async getInputAndLogin() {
        const { userName, password } = await this.getUserInput();
        const { browser, page } = await this.startBrowser();
        this.browser = browser;
        this.page = page;
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

    async viewSignOff() {
        const docSignBtn = ".docu_sign_btn";
        const signOffBtn = ".view_sign";

        try {
            await this.page.click(signOffBtn);
            console.log('Pending Policies for Sign-Off found !!!!');
            console.log('Singning them off !!!!');
            await this.page.click(docSignBtn);
        }
        catch (error) {
            console.log('No Pending Policies for Sign-Off found !!!!');
        }
    }

    async startRequestAttendance(checkPreviousMonth: boolean) {
        console.log("Finding absent days...", "checkPreviousMonth", checkPreviousMonth);

        await Promise.all([
            this.page.goto("https://pwhr.darwinbox.in/attendance/index/index/view/list", { waitUntil: "networkidle2" }),
            this.page.waitForNavigation()
        ]);

        await this.page.waitForSelector(".odd");
        await this.page.waitForSelector(".even");

        const areDaysLeft = await this.page.evaluate(async (checkPreviousMonth) => { // Runs in the browser context
            function sleep(time: number) {
                return new Promise((resolve) => {
                    setTimeout(resolve, time);
                });
            }
            if (checkPreviousMonth) {
                const monthDropDown = document.querySelector(".drop_month") as HTMLSelectElement;
                console.log("monthDropDown", monthDropDown, monthDropDown.value);
                const monthString = monthDropDown.value;
                const monthStringArr = monthString.split("-");
                const prevMonth = Number(monthStringArr[1]) - 1;
                const prevMonthString = monthStringArr[0] + "-" + "0" + prevMonth;
                console.log("prevMonthString", prevMonthString);
                monthDropDown.value = prevMonthString;
                monthDropDown.dispatchEvent(new Event('change', { bubbles: true }));
                console.log("Waiting for 5 seconds...");
                await sleep(5000);
                console.log("Waited for 5 seconds...");
            }
            
            const attendanceColor = "#f44336";
            const alreadyRequestedColor = "#999999";
            const odd = document.querySelectorAll(".odd");
            const even = document.querySelectorAll(".even");
            const days = [...odd, ...even];

            console.log("days", days);

            const absentDays = days.filter(day => day.classList.contains(attendanceColor) && !day.classList.contains(alreadyRequestedColor) && day.getElementsByTagName("img").length !== 0);

            console.log("absentDays", absentDays);

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
        }, checkPreviousMonth);

        console.log("Submitted attendance for a day...");

        if (areDaysLeft) {
            await this.startRequestAttendance(checkPreviousMonth);
        }
        console.log("Marked attendance for all days...");
    }

    async startApproveAttendance() {
        console.log('this scope', this);
        await this.page.goto("https://pwhr.darwinbox.in/tasksApi/GetTasks", { waitUntil: "networkidle2" });
        await this.page.waitForSelector(".requestDiv");
        // await this.sleep(3000);
        await this.page.evaluate(async () => { // Runs in the browser context
            console.log("Finding pending approvals...");
            const attendanceContainers = document.querySelectorAll('.requestDiv');
            for (let attendance of attendanceContainers) {
                const isAttendanceRequest = attendance.querySelectorAll('.reqType a')[0] as HTMLAnchorElement;
                // isAttendanceRequest.innerText === 'Attendance Request';
                if (isAttendanceRequest?.innerText === 'Attendance Request') {
                    const approveBtns = attendance.querySelectorAll('.btn-secondary-approve');
                    for (const approveBtn of approveBtns) {
                        if (approveBtn instanceof HTMLAnchorElement) {
                            approveBtn.click();
                        }
                    }
                }
            }
        });
    }

    async cleanup() {
        console.log("Cleaning up...");
        await this.browser.close();
        console.log("Bye.")
        process.exit(0);
    }

}

const app = new App();

const processVar = process.argv;
processVar.forEach((value, index) => {
    if (processVar[index] === 'approve') {
        app.approveAttendance(); // For approval
    } else if (processVar[index] === 'request') {
        app.requestAttendance(); // For requesting attendance
    }
});