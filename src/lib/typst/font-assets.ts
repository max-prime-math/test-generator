// Vite turns these imports into local URLs for the compiler worker. Keep the
// exact files explicit so font loading never depends on the host computer or
// a network connection.
import patrickHand from '../../assets/fonts/PatrickHand-Regular.ttf?url';
import libertinusRegular from '../../assets/fonts/LibertinusSerif-Regular.ttf?url';
import libertinusItalic from '../../assets/fonts/LibertinusSerif-Italic.ttf?url';
import libertinusBold from '../../assets/fonts/LibertinusSerif-Bold.ttf?url';
import libertinusBoldItalic from '../../assets/fonts/LibertinusSerif-BoldItalic.ttf?url';
import libertinusMath from '../../assets/fonts/LibertinusMath-Regular.ttf?url';
import stixText from '../../assets/fonts/STIXTwoText-wght.ttf?url';
import stixTextItalic from '../../assets/fonts/STIXTwoText-Italic-wght.ttf?url';
import stixMath from '../../assets/fonts/STIXTwoMath-Regular.ttf?url';
import sourceSerif from '../../assets/fonts/SourceSerif4-opsz-wght.ttf?url';
import sourceSerifItalic from '../../assets/fonts/SourceSerif4-Italic-opsz-wght.ttf?url';
import ebGaramond from '../../assets/fonts/EBGaramond-wght.ttf?url';
import ebGaramondItalic from '../../assets/fonts/EBGaramond-Italic-wght.ttf?url';
import crimsonPro from '../../assets/fonts/CrimsonPro-wght.ttf?url';
import crimsonProItalic from '../../assets/fonts/CrimsonPro-Italic-wght.ttf?url';
import lora from '../../assets/fonts/Lora-wght.ttf?url';
import loraItalic from '../../assets/fonts/Lora-Italic-wght.ttf?url';
import merriweather from '../../assets/fonts/Merriweather-opsz-wdth-wght.ttf?url';
import merriweatherItalic from '../../assets/fonts/Merriweather-Italic-opsz-wdth-wght.ttf?url';
import notoSerif from '../../assets/fonts/NotoSerif-wdth-wght.ttf?url';
import notoSerifItalic from '../../assets/fonts/NotoSerif-Italic-wdth-wght.ttf?url';
import robotoSlab from '../../assets/fonts/RobotoSlab-wght.ttf?url';
import atkinson from '../../assets/fonts/AtkinsonHyperlegibleNext-wght.ttf?url';
import atkinsonItalic from '../../assets/fonts/AtkinsonHyperlegibleNext-Italic-wght.ttf?url';

export const documentFontUrls = [
  patrickHand,
  libertinusRegular, libertinusItalic, libertinusBold, libertinusBoldItalic, libertinusMath,
  stixText, stixTextItalic, stixMath,
  sourceSerif, sourceSerifItalic,
  ebGaramond, ebGaramondItalic,
  crimsonPro, crimsonProItalic,
  lora, loraItalic,
  merriweather, merriweatherItalic,
  notoSerif, notoSerifItalic,
  robotoSlab,
  atkinson, atkinsonItalic,
];
