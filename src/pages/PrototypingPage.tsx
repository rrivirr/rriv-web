import banner from "@/assets/images/prototyping-banner.jpg";
import wiringDiagram from "@/assets/images/wiring-diagram.png";
import { InfoPage, NumberedPoints, type InfoPoint } from "@/components/InfoPage";

const POINTS: InfoPoint[] = [
  {
    title: "Tweak, test, repeat",
    body: "R&D requires hours of iterative refinement. Change settings and run tests without recompiling or remembering cumbersome workflows, and switch between stored configurations instantly using our client side tools.",
  },
  {
    title: "Flexible power supply options",
    body: "Power the system on the bench over USB, profile low power modes using the current ranger pin out, control external power supplies, or use the onboard 3.3v or 5v boost as power and/or ADC reference voltage.",
  },
  {
    title: "Advanced features",
    body: "RRIV's ARM Cortex-M3 based system is deep on features, including extreme low power modes, plenty of memory, peripherals, and GPIO, and capabilities of advanced microprocessors including USB, ethernet, DMA, and complex interrupt based processing for the trailblazing systems prototyper.",
    image: {
      src: wiringDiagram,
      alt: "Wiring diagram connecting the RRIV board's pin headers to a DHT22 temperature and humidity sensor, a 5v booster and a Figaro methane sensor",
    },
  },
  {
    title: "Actuators and communications",
    body: "In addition to sensors, the RRIV firmware has configurable slots for actuators and communications services, allowing system designers to experiment with and switch between complex control and communications setups as a system is refined.",
  },
];

export function PrototypingPage() {
  return (
    <InfoPage
      banner={banner}
      title="Prototyping"
      intro={
        <p>
          Tracking complex pollution events and subtle ecosystem changes
          requires leveraging technological advances in basic principles of
          water quality sensing. RRIV greatly reduces the system setup necessary
          to begin R&amp;D, allowing you to focus on building new sensor types
          for important insights in restoration, event mitigation, and planning
          for climate adaptation.
        </p>
      }
    >
      <NumberedPoints points={POINTS} />
    </InfoPage>
  );
}
