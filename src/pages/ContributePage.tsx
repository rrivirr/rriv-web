import { IconExternal } from "@/assets/Icons";
import { InfoPage } from "@/components/InfoPage";

const GITHUB_URL = "https://github.com/rrivirr";
const GPL_URL = "https://www.gnu.org/licenses/gpl-3.0.en.html";
const TAPR_URL = "https://files.tapr.org/OHL/TAPR_Open_Hardware_License_v1.0.pdf";

const inlineLink = "font-medium text-fg underline decoration-border underline-offset-4 transition hover:text-accent";

export function ContributePage() {
  return (
    <InfoPage
      title="Join the RRIV team!"
      intro={
        <>
          <p>
            We are building a hybrid, volunteer community using science,
            engineering, and ecological knowledge to put rivers, lakes, streams,
            wetlands, and oceans at the center of our technology. We are seeking
            volunteer contributors of all kinds – from embedded systems,
            hardware design, documentation authorship, and technical leadership
            to field testers, GIS, web application design, and mobile
            development. Come join us.
          </p>
          <p>
            Our platform is completely open source: software is licensed under{" "}
            <a href={GPL_URL} target="_blank" rel="noreferrer" className={inlineLink}>
              GPLv3
            </a>{" "}
            and hardware under{" "}
            <a href={TAPR_URL} target="_blank" rel="noreferrer" className={inlineLink}>
              TAPRv1
            </a>
            . Restoration and protection of Earth&apos;s waterways is an enormous
            task – there is a place for every engineer on the RRIV team!
          </p>
        </>
      }
    >
      <a
        href={GITHUB_URL}
        target="_blank"
        rel="noreferrer"
        className="btn btn-primary"
      >
        Find us on GitHub
        <IconExternal className="h-4 w-4" />
      </a>
    </InfoPage>
  );
}
