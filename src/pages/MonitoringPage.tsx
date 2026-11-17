import banner from "@/assets/images/monitoring-banner.jpg";
import sondeCase from "@/assets/images/sonde-case.jpg";
import { InfoPage, NumberedPoints, type InfoPoint } from "@/components/InfoPage";

const POINTS: InfoPoint[] = [
  {
    title: "Datalogger",
    body: "Extreme low power modes, easy configuration, and low costs allow projects without water quality monitoring to close that gap quickly and without extensive training.",
  },
  {
    title: "Waterproof case",
    body: "Our recommended waterproof sonde case can be built from materials available at any hardware store, or you can buy kits from us. Interchangeable laser-cut face plates can be provided to fit the number and size of sensors on your rig, or use the open plans to build your own case from scratch!",
    image: {
      src: sondeCase,
      alt: "RRIV waterproof sonde case: a cylindrical housing between clear end plates on threaded rods, with a mesh sensor guard",
    },
  },
  {
    title: "Accessible configurability",
    body: "A slot based and scriptable command line interface facilitates setup and reconfiguration of each assembled system for a variety of use cases. Sharable configuration files and tunable settings allow operators to design and quickly replicate systems for dense spatial deployments.",
  },
  {
    title: "Supported sensor kits",
    body: "For common use cases, we detail sensor kits that reduce or eliminate the technical knowledge and software driver development skills needed to build, calibrate, and deploy. For more complex needs, we expose a streamlined workflow for building your own sensor drivers.",
  },
];

export function MonitoringPage() {
  return (
    <InfoPage
      banner={banner}
      title="Monitoring"
      intro={
        <p>
          Restoration projects need long term monitoring to assess success. Yet
          costs often limit achievable monitoring for resource limited
          projects, either reducing the number of monitoring sites along stream
          reaches, or skipping water quality monitoring entirely. DIY solutions
          typically require advanced software and electrical engineering
          skills. RRIV targets the sweet spot: streamlining DIY to simplify
          setup and deployment while keeping costs low.
        </p>
      }
    >
      <NumberedPoints points={POINTS} />
    </InfoPage>
  );
}
