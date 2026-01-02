import puppeteer from "puppeteer";
import fs from "fs/promises";

let totalData = 0;
const scrapeData = async () => {
  try {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    // page.on('console', msg => console.log('PAGE:', msg.text()));

    await page.goto("https://karirlink.id", {
      waitUntil: "networkidle2",
    });

    const results = [];
    let pageCounter = 1;
    while (true) {
      const pageData = await page.evaluate(() => {
        const cards = document.querySelectorAll(".front-vacancy__card");
        return Array.from(cards).map((card) => {
          const link = card.getAttribute("href") || "";
          const img = card.querySelector(".front-vacancy__logo")?.src || "";
          const title =
            card
              .querySelector(".front-vacancy__card-title")
              ?.textContent.replace(/\s+/g, " ")
              .trim() || "";
          const company =
            card
              .querySelector(".front-vacancy__company")
              ?.textContent.replace(/\s+/g, " ")
              .trim() || "";
          const published =
            card
              .querySelector(".front-vacancy__position")
              ?.textContent.replace(/\s+/g, " ")
              .trim() || "";
          const location =
            card
              .querySelector(".front-vacancy__card-text")
              ?.textContent.replace(/\s+/g, " ")
              .trim() || "";
          return { link, img, title, company, published, location };
        });
      });
      totalData += pageData.length;
      results.push({ page: pageCounter, data: pageData });

      // cek ada tombol next
      const nextButton = await page.$(".pagination__button-next");
      if (!nextButton) {
        break;
      }

      const isDisabled = await page.evaluate(
        (button) => button.disabled,
        nextButton
      );
      if (isDisabled) {
        break;
      }

      //   if (pageCounter >= 1) {
      //     // limit to 5 pages for demo purposes
      //     break;
      //   }

      await Promise.all([
        page.waitForNavigation({ waitUntil: "networkidle2" }),
        nextButton.click(),
      ]);
      pageCounter += 1;
    }
    // Now scrape job descriptions
    for (const pageResult of results) {
      for (const item of pageResult.data) {
        if (item.link) {
          await page.goto(item.link, { waitUntil: "networkidle2" });
          const res = await page.evaluate(() => {
            // Adjust selector based on the job page
            const description =
              document
                .querySelector(".vacancy-detail__section-content")
                ?.textContent.replace(/\s+/g, " ")
                .trim() || "";

            const vacancyDetail = Array.from(
              document.querySelectorAll(".vacancy-detail__container-content")
            ).map((el) => el.textContent);
            const jobType = vacancyDetail[0].replace(/\s+/g, " ").trim() || "";
            const salaryRange =
              vacancyDetail[1].replace(/\s+/g, " ").trim() || "";

            return { description, jobType, salaryRange };
          });
          const { description: jobDescription, jobType, salaryRange } = res;
          item.details = { jobDescription, jobType, salaryRange };
        }
      }
    }

    // Flatten the data for CSV
    const flatData = results.flatMap((pageResult) =>
      pageResult.data.map((item) => ({
        // page: pageResult.page,
        link: item.link,
        img: item.img,
        title: item.title,
        company: item.company,
        published: item.published,
        location: item.location,
        jobDescription: item.details?.jobDescription || "",
        jobType: item.details?.jobType || "",
        salaryRange: item.details?.salaryRange || "",
      }))
    );

    // Create CSV string
    const header =
      "link,img,title,company,published,location,jobDescription,jobType,salaryRange\n";
    let csv = header;
    for (const row of flatData) {
      csv += `"${row.link}","${row.img}","${row.title}","${row.company}","${row.published}","${row.location}","${row.jobDescription}","${row.jobType}","${row.salaryRange}"\n`;
    }

    await fs.writeFile("scraped_data.csv", csv);
    await fs.writeFile("scraped_data.json", JSON.stringify(results, null, 2));

    await browser.close();
  } catch (error) {
    console.error("Error during scraping:", error.stack);
    clearInterval(timer);
    process.stdout.write("\n");
    console.timeEnd("time elapsed");
    process.exit(1);
  }
};

console.time("time elapsed");
const startTime = process.hrtime.bigint();
const timer = setInterval(() => {
  const elapsedSec = Number(process.hrtime.bigint() - startTime) / 1e9;
  const minutes = Math.floor(elapsedSec / 60);
  const seconds = Math.floor(elapsedSec % 60);
  process.stdout.write(
    `\rElapsed: ${minutes}:${seconds.toString().padStart(2, "0")} (m:ss)`
  );
}, 1000); // Update every 1 second

console.log("start scraping");
await scrapeData();
console.log("\nend scraping");
console.log("total data:", totalData);
clearInterval(timer);
process.stdout.write("\n");
console.timeEnd("time elapsed");
