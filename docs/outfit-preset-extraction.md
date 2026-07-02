# Outfit Preset Extraction

Source folder: `C:\Users\wwgww\Pictures\여자\99. 착장`

Status: extracted only, not wired into image generation.

Rule: do not copy face or identity. Extract only outfit, fit, colors, fabric, length, accessories, and styling.

## Prompt Mixing Rules

- Keep hair, face shape, makeup, and body random.
- Pull outfit from one preset at a time.
- Use `fit` strongly. This prevents random prompts from mixing loose knitwear with latex, office wear with bikini details, or school uniform with evening dress parts.
- Use `exposure` as a filter before generation.
- Use `avoid` as negative prompt fragments when the preset is used.

## Raw Presets

### outfit_0001
- source: `0001.png`
- useCase: street, casual, city
- exposure: low
- fit: cropped fitted outerwear, tight skinny bottom
- outfitPrompt: `a black fitted leather biker jacket with a cropped waist, layered over a plain white top, black high-waisted skinny pants, slim city street styling, sharp structured shoulders, compact silhouette`
- colors: black, white
- accessories: crossbody strap or small black bag
- avoid: gown, swimsuit, school uniform, fantasy armor

### outfit_0002
- source: `0002.png`
- useCase: adult, nightlife
- exposure: high
- fit: very tight bodycon, short mini length
- outfitPrompt: `a burgundy bodycon mini dress with a corset-like waist panel, deep neckline, sleeveless upper cut, very tight fit through the torso and hips, short clubwear silhouette`
- colors: burgundy, beige
- accessories: minimal jewelry
- avoid: loose oversized fit, office blazer, sportswear

### outfit_0003
- source: `0003.png`
- useCase: summer, date, seaside
- exposure: medium
- fit: fitted cropped top, tight mini skirt
- outfitPrompt: `a white short-sleeve cropped cardigan with black button accents, paired with a high-waisted gray bodycon mini skirt, clean fitted summer styling, compact waist emphasis`
- colors: white, black, gray
- accessories: none
- avoid: oversized sweater, long skirt, heavy coat

### outfit_0004
- source: `0004.png`
- useCase: resort, summer
- exposure: medium-high
- fit: loose short romper with cinched waist
- outfitPrompt: `a white sleeveless ruffled romper with a soft gathered neckline, gold button details, slim belt at the waist, loose airy shorts, resort poolside styling`
- colors: white, gold
- accessories: thin belt
- avoid: leather, dark business suit, winter knit

### outfit_0005
- source: `0005.png`
- useCase: preppy, casual, campus
- exposure: low-medium
- fit: cropped fitted cardigan, structured pleated mini skirt
- outfitPrompt: `a beige cropped button cardigan layered over a white collared shirt, matching beige pleated mini skirt, rolled white cuffs, neat preppy styling, fitted waist with a soft school-inspired silhouette`
- colors: beige, white
- accessories: knee socks
- avoid: bikini, latex, evening gown

### outfit_0006
- source: `0006.png`
- useCase: beach, swim
- exposure: high
- fit: minimal bikini, tight swim fit
- outfitPrompt: `a white ruffled off-shoulder bikini with frill trim along the top and bottoms, minimal beachwear coverage, soft romantic swim styling`
- colors: white
- accessories: none
- avoid: office wear, heavy outerwear, sneakers

### outfit_0007
- source: `0007.png`
- useCase: themed, sporty-preppy
- exposure: medium
- fit: fitted short blouse, tight mini skirt
- outfitPrompt: `a white short-sleeve button shirt with a small emblem patch, navy neck scarf, bright blue high-waisted bodycon mini skirt, fitted flight-attendant-inspired styling`
- colors: white, navy, blue
- accessories: neck scarf
- avoid: loose hoodie, long pants, fantasy costume

### outfit_0008
- source: `0008.png`
- useCase: adult, nightlife
- exposure: high
- fit: lace crop top, flared micro mini skirt
- outfitPrompt: `a black lace bralette-style crop top with thin straps, paired with a black pleated micro mini skirt, sheer lace texture, tight upper fit and flared lower silhouette`
- colors: black
- accessories: garter-like thigh straps
- avoid: casual denim, office blouse, long coat

### outfit_0009
- source: `0009.png`
- useCase: sporty, casual
- exposure: medium-high
- fit: tight cropped tee, short fitted shorts
- outfitPrompt: `a navy cropped graphic baby tee, white low-rise fitted shorts with belt detail, sporty casual styling, tight compact fit, exposed midriff`
- colors: navy, white
- accessories: white belt
- avoid: formal dress, heavy knitwear

### outfit_0010
- source: `0010.png`
- useCase: date, semi-formal
- exposure: medium
- fit: fitted long-sleeve top, tight pencil skirt with high slit
- outfitPrompt: `a soft pink fitted long-sleeve knit top tucked into a beige high-waisted pencil skirt, front thigh slit, black sheer tights, elegant tight silhouette`
- colors: pink, beige, black
- accessories: tights
- avoid: swimsuit, oversized hoodie, pleated school skirt

### outfit_0011
- source: `0011.png`
- useCase: evening, formal
- exposure: high
- fit: tight satin cheongsam, long length with high slit
- outfitPrompt: `a silver satin cheongsam-style evening dress with red piping, floral embroidery, body-hugging waist and hips, high side slit, glossy formal fabric`
- colors: silver, red
- accessories: none
- avoid: casual sneakers, denim shorts

### outfit_0012
- source: `0012.png`
- useCase: adult, nightlife
- exposure: high
- fit: tight mini slip dress
- outfitPrompt: `a black spaghetti-strap bodycon mini dress, simple straight neckline, very tight fit, short hem, paired with sheer black stockings`
- colors: black
- accessories: stockings
- avoid: loose fit, school uniform, sports bra

### outfit_0013
- source: `0013.png`
- useCase: evening, formal
- exposure: high
- fit: tight long dress, high slit
- outfitPrompt: `a red floral halter-style long evening dress, glossy satin-like fabric, bodycon torso, dramatic thigh-high side slit, elegant banquet styling`
- colors: red, green, gold
- accessories: heels
- avoid: casual hoodie, baseball cap

### outfit_0014
- source: `0014.png`
- useCase: playful, summer
- exposure: medium
- fit: loose romper, cinched waist
- outfitPrompt: `a white off-shoulder short romper with puff sleeves, pink printed belt, soft gathered waist, loose playful summer fit`
- colors: white, pink
- accessories: printed belt
- avoid: black leather, formal blazer

### outfit_0015
- source: `0015.png`
- useCase: swim, adult
- exposure: high
- fit: tight one-piece swimsuit
- outfitPrompt: `a black ribbed halter one-piece swimsuit with a deep front cutout and side tie details, tight swimwear fit, minimal resort styling`
- colors: black
- accessories: none
- avoid: winter coat, office skirt

### outfit_0016
- source: `0016.png`
- useCase: costume, maid
- exposure: high
- fit: tight cutout bodysuit, frilled apron elements
- outfitPrompt: `a white maid-inspired cutout bodysuit with black piping, frilled trim, halter straps, garter-style details, very tight costume fit`
- colors: white, black
- accessories: frills, garter straps
- avoid: casual realism, office wear

### outfit_0017
- source: `0017.png`
- useCase: school-inspired, casual
- exposure: medium
- fit: tight sleeveless top, loose pleated mini skirt
- outfitPrompt: `a white sleeveless knit top with a gray bow tie detail, paired with gray pleated mini shorts or skirt, sporty school-inspired look, fitted upper body with loose lower pleats`
- colors: white, gray
- accessories: striped knee socks
- avoid: evening gown, swimwear

### outfit_0018
- source: `0018.png`
- useCase: lingerie, adult
- exposure: high
- fit: tight lace bodysuit
- outfitPrompt: `a pale blue lace lingerie bodysuit with structured cups, sheer floral lace panels, thin straps, tight sculpted fit`
- colors: pale blue
- accessories: lace trim
- avoid: casual denim, outdoor coat

### outfit_0019
- source: `0019.png`
- useCase: costume, nurse
- exposure: high
- fit: sheer tight mini dress
- outfitPrompt: `a sheer white lace nurse-inspired mini dress with a large red bow at the chest, red fishnet stockings, tight costume silhouette`
- colors: white, red
- accessories: bow, fishnet stockings
- avoid: realistic hospital uniform, casual streetwear

### outfit_0020
- source: `0020.png`
- useCase: dressy, black
- exposure: low-medium
- fit: fitted blazer mini dress, flared hem
- outfitPrompt: `a black double-breasted blazer mini dress with long sleeves, fitted waist, slightly flared skirt hem, polished dark feminine styling`
- colors: black
- accessories: black heels
- avoid: bikini, latex catsuit

### outfit_0021
- source: `0021.png`
- useCase: casual, date, street
- exposure: medium
- fit: fitted knit top, short wrap skirt
- outfitPrompt: `an ivory ribbed long-sleeve fitted knit top, cream wrap mini skirt with side tie, white sneakers, soft casual date styling, slim but not bodycon fit`
- colors: ivory, cream, white
- accessories: black shoulder bag
- avoid: lingerie, fantasy costume

### outfit_0022
- source: `0022.png`
- useCase: office, formal
- exposure: medium
- fit: fitted blazer, tight mini skirt
- outfitPrompt: `a black fitted business blazer over a white shirt, burgundy tie, black high-waisted bodycon mini skirt, sharp office-uniform styling`
- colors: black, white, burgundy
- accessories: tie
- avoid: swimsuit, loose streetwear

### outfit_0024
- source: `0024.png`
- useCase: school-inspired
- exposure: medium
- fit: fitted shirt, loose pleated mini skirt
- outfitPrompt: `a white long-sleeve button shirt with a red neck scarf, navy pleated mini skirt, clean school-inspired styling, fitted waist and crisp fabric`
- colors: white, red, navy
- accessories: neck scarf
- avoid: leather catsuit, evening gown

### outfit_0025
- source: `0025.png`
- useCase: sporty, casual
- exposure: medium
- fit: cropped sweatshirt, loose pleated mini skirt
- outfitPrompt: `a sky-blue cropped long-sleeve sweatshirt, white pleated mini skirt, white socks, soft sporty casual styling, relaxed top with a short flared skirt`
- colors: sky blue, white
- accessories: socks
- avoid: lace lingerie, business blazer

### outfit_0026
- source: `0026.png`
- useCase: school-inspired, preppy
- exposure: low-medium
- fit: loose vest, pleated mini skirt
- outfitPrompt: `a gray sleeveless knit vest over a white short-sleeve blouse, black ribbon tie, dark plaid pleated mini skirt, soft preppy school styling`
- colors: gray, white, black
- accessories: ribbon tie
- avoid: bodycon dress, swimwear

### outfit_0027
- source: `0027.png`
- useCase: athletic
- exposure: medium
- fit: tight sports bra, compression leggings
- outfitPrompt: `a black sports bra with red underband, white high-waisted compression leggings, black calf panels, athletic tight performance fit`
- colors: black, white, red
- accessories: none
- avoid: skirt, blazer, gown

### outfit_0030
- source: `0030.png`
- useCase: cute, lingerie-costume
- exposure: medium-high
- fit: fitted crop camisole, layered frill shorts
- outfitPrompt: `a white cropped camisole with purple bow accents, layered lavender frill shorts over black lace bloomers, cute costume-like styling, fitted top with puffed lower volume`
- colors: white, lavender, black
- accessories: bow details
- avoid: formal blazer, denim streetwear

### outfit_0031
- source: `0031.png`
- useCase: tennis, sporty
- exposure: medium
- fit: fitted tank, flared tennis skirt
- outfitPrompt: `a white sleeveless tennis dress with black trim, fitted upper body and flared pleated skirt, clean athletic court styling`
- colors: white, black
- accessories: visor or racket optional
- avoid: lingerie, office tie

### outfit_0034
- source: `0034.png`
- useCase: casual, preppy, outdoor
- exposure: medium
- fit: fitted sleeveless vest, loose pleated mini skirt
- outfitPrompt: `a navy sleeveless button knit vest, beige plaid pleated mini skirt, cream canvas tote bag, casual preppy outdoor styling, fitted top with loose short skirt`
- colors: navy, beige, cream
- accessories: canvas tote
- avoid: latex, formal gown

### outfit_0035
- source: `0035.png`
- useCase: athletic, lounge
- exposure: medium
- fit: tight sports bra, tight leggings
- outfitPrompt: `a white seamless sports bra and matching high-waisted leggings, sculpted athletic fit, clean minimal activewear`
- colors: white
- accessories: smartwatch
- avoid: mini skirt, blazer

### outfit_0036
- source: `0036.png`
- useCase: date, nightlife
- exposure: medium
- fit: tight camisole, tight leather mini skirt
- outfitPrompt: `a black spaghetti-strap camisole tucked into a silver-gray faux leather mini skirt with a side slit, fitted nightlife styling, glossy tight lower silhouette`
- colors: black, silver gray
- accessories: bracelet
- avoid: loose sweater, school uniform

### outfit_0037
- source: `0037.png`
- useCase: office, date
- exposure: low-medium
- fit: fitted blouse, tight pencil skirt
- outfitPrompt: `a lavender satin button blouse tucked into a pale gray high-waisted pencil skirt, slim office-date silhouette, soft glossy fabric`
- colors: lavender, pale gray
- accessories: smartwatch
- avoid: bikini, fantasy armor

### outfit_0039
- source: `0039.png`
- useCase: winter, street
- exposure: low-medium
- fit: oversized sweater dress, belted waist
- outfitPrompt: `an oversized ivory long-sleeve sweater mini dress cinched with a wide black belt, slouchy sleeves, thigh-high black boots, loose upper fit with defined waist`
- colors: ivory, black
- accessories: belt, boots, small black bag
- avoid: summer bikini, school blazer

### outfit_0040
- source: `0040.png`
- useCase: summer, casual
- exposure: medium
- fit: tight crop top, fitted denim shorts
- outfitPrompt: `a white asymmetrical strappy crop top, light blue high-waisted denim shorts, casual summer styling, fitted waist and compact silhouette`
- colors: white, light blue
- accessories: bracelet
- avoid: formal skirt suit

### outfit_0041
- source: `0041.png`
- useCase: date, summer
- exposure: low-medium
- fit: fitted sleeveless mini dress
- outfitPrompt: `a black sleeveless mini dress with a simple fitted bodice and slight A-line hem, black strappy sandals, minimal summer date styling`
- colors: black
- accessories: small black shoulder bag
- avoid: athletic leggings, heavy coat

### outfit_0042
- source: `0042.png`
- useCase: playful, adult
- exposure: medium-high
- fit: lace bra top, tight mini skirt
- outfitPrompt: `a lavender floral lace bra top with 3D flower appliques, pale pink high-waisted bodycon mini skirt, soft pastel adult styling, tight waist and short hem`
- colors: lavender, pale pink
- accessories: flower appliques
- avoid: office blazer, sporty sneakers

### outfit_0043
- source: `0043.png`
- useCase: athletic, casual
- exposure: medium
- fit: fitted long-sleeve top, tight dolphin shorts
- outfitPrompt: `a fitted white long-sleeve crop top layered under a black cropped tank, gray tight dolphin shorts with white trim, sporty lounge styling`
- colors: white, black, gray
- accessories: none
- avoid: formal gown, school tie

### outfit_0044
- source: `0044.png`
- useCase: sporty, nightlife
- exposure: medium
- fit: tight sleeveless mini dress
- outfitPrompt: `a dark green sleeveless velour mini dress with a high collar, bodycon fit, side slit, sporty-luxe club styling`
- colors: dark green
- accessories: none
- avoid: loose casual jeans

### outfit_0045
- source: `0045.png`
- useCase: sporty, casual
- exposure: medium-high
- fit: bandeau crop top, tight ruched shorts
- outfitPrompt: `a black bandeau crop top, beige low-rise ruched micro shorts with side drawstrings, tight sporty summer fit`
- colors: black, beige
- accessories: handheld gadget optional
- avoid: long skirt, blazer

### outfit_0046
- source: `0046.png`
- useCase: evening, formal
- exposure: high
- fit: tight long dress, high slit
- outfitPrompt: `a navy sleeveless high-neck evening gown with ornate gold floral embroidery and a thigh-high slit, fitted torso and long dramatic skirt`
- colors: navy, gold
- accessories: heels
- avoid: casual sneakers, school socks

### outfit_0047
- source: `0047.png`
- useCase: casual, summer
- exposure: medium
- fit: loose open shirt, tight mini skirt
- outfitPrompt: `a loose white short-sleeve button shirt worn open over a fitted white tank, black high-waisted bodycon mini skirt, relaxed summer street styling`
- colors: white, black
- accessories: none
- avoid: lingerie lace, fantasy armor

### outfit_0048
- source: `0048.png`
- useCase: preppy, date
- exposure: medium
- fit: fitted knit top, flared pleated mini skirt
- outfitPrompt: `a pale mint fitted short-sleeve knit top, white pleated mini skirt with a belt, black thigh-high socks, cute preppy silhouette`
- colors: mint, white, black
- accessories: white belt, thigh-high socks
- avoid: latex, swimsuit

### outfit_0049
- source: `0049.png`
- useCase: adult, nightlife
- exposure: high
- fit: sheer tight top, flared mini skirt
- outfitPrompt: `a black sheer long-sleeve mesh top over a dark bra, paired with a black flared mini skirt, tight upper body with short flared lower silhouette`
- colors: black
- accessories: none
- avoid: office blouse, denim shorts

### outfit_0050
- source: `0050.png`
- useCase: sporty, tennis
- exposure: medium
- fit: tight sleeveless crop top, flared tennis skirt
- outfitPrompt: `a burgundy sleeveless high-neck crop top, white flared tennis mini skirt, fitted sporty silhouette with exposed midriff`
- colors: burgundy, white
- accessories: none
- avoid: long dress, business suit

### outfit_0051
- source: `0051.png`
- useCase: athletic
- exposure: medium
- fit: tight crop tank, compression leggings
- outfitPrompt: `a beige sleeveless cropped athletic top with cutout waist detail, taupe high-waisted compression leggings, body-hugging gym fit`
- colors: beige, taupe
- accessories: none
- avoid: lace, school uniform

### outfit_0052
- source: `0052.png`
- useCase: summer, casual
- exposure: medium-high
- fit: oversized loose knit, tight shorts
- outfitPrompt: `a peach loose open-knit long-sleeve sweater falling off one shoulder, cream low-rise fitted shorts, relaxed top with tight short bottom contrast`
- colors: peach, cream
- accessories: none
- avoid: formal blazer, pleated uniform

### outfit_0053
- source: `0053.png`
- useCase: costume, adult
- exposure: high
- fit: cropped blouse, very short shorts, garter stockings
- outfitPrompt: `a white cropped blouse with puff sleeves and a gray bow, denim micro shorts with garter straps, black thigh-high stockings, tight costume styling`
- colors: white, gray, denim blue, black
- accessories: bow, garters, thigh-high stockings
- avoid: casual realism, office skirt

### outfit_0054
- source: `0054.png`
- useCase: date, knit
- exposure: medium-high
- fit: tight off-shoulder sweater dress
- outfitPrompt: `a gray ribbed off-shoulder bodycon mini sweater dress with front lace-up tie, very tight knit fit, short hem`
- colors: gray
- accessories: front tie
- avoid: loose hoodie, long coat

### outfit_0055
- source: `0055.png`
- useCase: school-inspired, uniform
- exposure: medium
- fit: fitted blazer, pleated mini skirt
- outfitPrompt: `a navy school-uniform blazer over a white shirt, striped tie, navy pleated mini skirt, structured preppy silhouette`
- colors: navy, white, gray
- accessories: tie, shoulder bag
- avoid: swimsuit, evening dress

### outfit_0056
- source: `0056.png`
- useCase: date, adult
- exposure: high
- fit: tight white mini dress
- outfitPrompt: `a white bodycon mini dress with thin straps and a deep neckline, soft stretchy fabric, very tight torso and hip fit`
- colors: white
- accessories: none
- avoid: loose fit, blazer, sportswear

### outfit_0057
- source: `0057.png`
- useCase: athletic, gym
- exposure: medium
- fit: tight sleeveless crop top, tight leggings
- outfitPrompt: `a pale yellow sleeveless crop workout top, gray high-waisted compression leggings, tight gym silhouette with clean athletic styling`
- colors: pale yellow, gray
- accessories: none
- avoid: frills, formalwear

### outfit_0058
- source: `0058.png`, `0111.png`
- useCase: streetwear, graphic
- exposure: medium
- fit: strapless bodycon mini dress
- outfitPrompt: `a yellow strapless DHL-logo print bodycon mini dress, very tight tube-dress fit, loud graphic streetwear styling`
- colors: yellow, red
- accessories: none
- avoid: soft pastel, office wear

### outfit_0061
- source: `0061.png`
- useCase: date, summer
- exposure: low-medium
- fit: loose white shirt dress, cinched waist
- outfitPrompt: `a white semi-sheer long-sleeve shirt dress with a belted waist, ruffled short hem, airy loose fit with defined waist`
- colors: white
- accessories: black mini bag, white heels
- avoid: latex, athletic leggings

### outfit_0062
- source: `0062.png`
- useCase: preppy, casual
- exposure: low-medium
- fit: fitted crop knit, loose plaid skirt
- outfitPrompt: `a white fitted long-sleeve cropped knit top, gray plaid pleated mini skirt, white thigh-high socks, soft school-inspired casual styling`
- colors: white, gray
- accessories: thigh-high socks
- avoid: lingerie, gown

### outfit_0064
- source: `0064.png`
- useCase: date, minimalist
- exposure: low-medium
- fit: slim satin slip mini dress
- outfitPrompt: `a white satin sleeveless slip mini dress with a draped neckline, slim fitted waist, smooth minimalist date styling`
- colors: white
- accessories: none
- avoid: sportswear, school tie

### outfit_0065
- source: `0065.png`
- useCase: casual, lounge
- exposure: medium
- fit: loose white tee, tight ruched mini skirt
- outfitPrompt: `a loose white short-sleeve tee layered over a white tank, gray ruched bodycon mini skirt, casual indoor styling with relaxed top and tight skirt`
- colors: white, gray
- accessories: none
- avoid: formal gown, bikini

### outfit_0066
- source: `0066.png`
- useCase: fantasy, costume
- exposure: medium
- fit: corset bodice, flared mini skirt
- outfitPrompt: `a white fantasy mini dress with a metallic silver corset bodice, structured bust, flared short skirt, glossy armored waist styling`
- colors: white, silver
- accessories: corset armor
- avoid: realistic office outfit

### outfit_0069
- source: `0069.png`
- useCase: romantic, preppy
- exposure: low-medium
- fit: fitted cropped jacket, flared pleated skirt
- outfitPrompt: `a cream tweed cropped jacket with gold buttons, white pleated mini skirt, soft romantic preppy styling, fitted top and flared skirt`
- colors: cream, white, gold
- accessories: gold buttons
- avoid: leather, swimwear

### outfit_0070
- source: `0070.png`
- useCase: street, adult
- exposure: medium-high
- fit: tight cropped cardigan, tight plaid micro skirt
- outfitPrompt: `a white ruched cropped cardigan with front buttons, beige plaid micro mini skirt, white lace thigh-high stockings, tight street styling`
- colors: white, beige
- accessories: lace thigh-high stockings
- avoid: long pants, formal gown

### outfit_0071
- source: `0071.png`
- useCase: summer, cute
- exposure: medium
- fit: boxy vest, loose shorts
- outfitPrompt: `a pink sleeveless tweed vest with front buttons, matching high-waisted shorts with scalloped trim, loose cute summer set`
- colors: pink
- accessories: small handbag
- avoid: latex, black leather

### outfit_0072
- source: `0072.png`
- useCase: city, casual
- exposure: low-medium
- fit: sleeveless fitted top, belted flared skirt
- outfitPrompt: `a black sleeveless top tucked into a black belted A-line mini skirt, structured city styling, fitted waist with loose skirt volume`
- colors: black
- accessories: chain crossbody bag, belt
- avoid: lingerie, swimsuit

### outfit_0073
- source: `0073.png`
- useCase: summer, romantic
- exposure: low-medium
- fit: loose tiered dress
- outfitPrompt: `a black short-sleeve tiered babydoll mini dress, airy loose fit, soft puff sleeves, relaxed summer silhouette`
- colors: black
- accessories: small black shoulder bag
- avoid: bodycon latex, office pencil skirt

### outfit_0074
- source: `0074.png`
- useCase: party, evening
- exposure: medium-high
- fit: tight strapless mini dress
- outfitPrompt: `a silver metallic strapless bodycon mini dress, glossy reflective fabric, tight straight silhouette, party styling`
- colors: silver
- accessories: none
- avoid: casual cotton, sneakers

### outfit_0075
- source: `0075.png`
- useCase: school-inspired, sporty
- exposure: medium
- fit: fitted long-sleeve top, flared mini skirt
- outfitPrompt: `a white fitted long-sleeve top with black collar and cuffs, black flared mini skirt, black thigh-high socks, sporty school-inspired styling`
- colors: white, black
- accessories: thigh-high socks
- avoid: bikini, latex

### outfit_0076
- source: `0076.png`
- useCase: adult, costume
- exposure: high
- fit: fishnet body stocking
- outfitPrompt: `a nude-toned fishnet bodystocking with black ribbon bows, sheer full-body net texture, very tight costume fit`
- colors: nude, black
- accessories: ribbon bows
- avoid: casual realism, office wear

### outfit_0077
- source: `0077.png`
- useCase: adult, nightlife
- exposure: high
- fit: sheer cropped blouse, tight vinyl mini skirt
- outfitPrompt: `a sheer white cropped blouse with black ribbon bow, black glossy vinyl micro mini skirt with chain belt, tight clubwear silhouette`
- colors: white, black, gold
- accessories: ribbon bow, chain belt
- avoid: loose knitwear, denim casual

### outfit_0078
- source: `0078.png`
- useCase: sporty, athletic
- exposure: medium
- fit: loose jersey top, tight leggings
- outfitPrompt: `a white cropped baseball jersey top, olive high-waisted athletic leggings, white striped knee socks, sporty fitted lower silhouette`
- colors: white, olive
- accessories: striped socks
- avoid: lace dress, business suit

### outfit_0079
- source: `0079.png`
- useCase: adult, latex
- exposure: high
- fit: glossy latex crop top and mini skirt
- outfitPrompt: `a black glossy latex long-sleeve crop top with deep neckline, matching black latex micro mini skirt, extremely tight reflective clubwear fit`
- colors: black
- accessories: choker ribbon
- avoid: soft cotton, loose fit

### outfit_0080
- source: `0080.png`
- useCase: sailor, costume
- exposure: medium-high
- fit: cropped sailor top, pleated mini skirt
- outfitPrompt: `a white cropped sailor-style sleeveless top with navy trim and gold buttons, navy pleated mini skirt, garter stockings, tight costume styling`
- colors: white, navy, gold
- accessories: sailor collar, garters
- avoid: realistic office wear

### outfit_0081
- source: `0081.png`
- useCase: romantic, dress
- exposure: low-medium
- fit: loose blouse top, belted mini dress
- outfitPrompt: `a beige long-sleeve mini dress with blouse-like top, high gathered waist, double-breasted belt detail, soft loose sleeves and short skirt`
- colors: beige
- accessories: belt
- avoid: sportswear, bikini

### outfit_0082
- source: `0082.png`
- useCase: adult, bodysuit
- exposure: high
- fit: tight cutout bodysuit
- outfitPrompt: `a white and blue cutout bodysuit with side ties, high-cut leg openings, tight costume-swim hybrid fit`
- colors: white, blue
- accessories: side ties
- avoid: casual jeans, blazer

### outfit_0083
- source: `0083.png`
- useCase: formal, resort
- exposure: high
- fit: flowing long dress, high slit
- outfitPrompt: `a cream halter maxi dress with black polka dots, flowing skirt, plunging neckline, thigh-high slit, resort evening styling`
- colors: cream, black
- accessories: heels
- avoid: sporty leggings, hoodie

### outfit_0084
- source: `0084.png`
- useCase: sporty, swim
- exposure: medium-high
- fit: tight sport crop top, high-waisted swim bottom
- outfitPrompt: `a white athletic crop top with navy high-waisted swim shorts, white thigh-high athletic socks with navy stripes, tight sporty swim styling`
- colors: white, navy
- accessories: striped socks
- avoid: office blouse, long gown

### outfit_0085
- source: `0085.png`
- useCase: date, black dress
- exposure: medium
- fit: fitted wrap mini dress
- outfitPrompt: `a black short-sleeve wrap mini dress with ruffled neckline, cinched waist buckle, soft fitted date silhouette`
- colors: black
- accessories: waist buckle
- avoid: latex bodysuit, school uniform

### outfit_0086
- source: `0086.png`
- useCase: street, summer
- exposure: medium-high
- fit: tight crop tee, distressed micro shorts
- outfitPrompt: `a navy tight cropped baby tee, distressed low-rise denim micro shorts, white thigh-high stocking on one leg, edgy casual styling`
- colors: navy, denim blue, white
- accessories: thigh stocking
- avoid: formal blazer, gown

### outfit_0087
- source: `0087.png`
- useCase: sporty, tennis
- exposure: low-medium
- fit: loose polo, flared tennis skirt
- outfitPrompt: `a black short-sleeve polo shirt tucked into a cream pleated tennis mini skirt, white sneakers, sporty casual fit`
- colors: black, cream, white
- accessories: sneakers
- avoid: lingerie, latex

### outfit_0088
- source: `0088.png`
- useCase: uniform, school-inspired
- exposure: medium
- fit: fitted blouse, structured pleated skirt
- outfitPrompt: `a dark gray short-sleeve button blouse with a black bow at the collar, black pleated mini skirt, sheer black tights, fitted school-inspired styling`
- colors: dark gray, black
- accessories: bow, tights
- avoid: swimsuit, evening gown

### outfit_0089
- source: `0089.jpg`
- useCase: adult, costume
- exposure: high
- fit: mesh corset top, micro skirt
- outfitPrompt: `a sheer gray mesh corset-style halter top with neck tie, matching micro mini skirt with black trim, garter stockings, tight costume silhouette`
- colors: gray, black
- accessories: garters, neck tie
- avoid: casual cotton, office wear

### outfit_0090
- source: `0090.png`
- useCase: office, adult
- exposure: medium
- fit: tight cropped shirt, tight mini skirt
- outfitPrompt: `a white cropped button shirt with black necktie, black high-waisted bodycon mini skirt, fitted office-inspired styling`
- colors: white, black
- accessories: necktie
- avoid: loose sweater, swimwear

### outfit_0091
- source: `0091.png`
- useCase: lingerie, adult
- exposure: high
- fit: sheer lace bodysuit
- outfitPrompt: `a peach sheer lace lingerie bodysuit with thin straps, scalloped lace edges, transparent fitted fabric, delicate adult styling`
- colors: peach, nude
- accessories: lace trim
- avoid: casual realism, street coat

### outfit_0092
- source: `0092.png`
- useCase: evening, formal
- exposure: high
- fit: tight black long dress, high slit
- outfitPrompt: `a black lace halter evening gown with side cutouts, sheer lace torso panels, thigh-high slit, fitted waist and long skirt`
- colors: black
- accessories: heels
- avoid: sportswear, school socks

### outfit_0093
- source: `0093.png`
- useCase: office, adult
- exposure: medium-high
- fit: fitted blouse, tight lace mini skirt
- outfitPrompt: `a white button blouse tucked into a black sheer lace bodycon mini skirt, slim office-adult styling, tight skirt with transparent lace texture`
- colors: white, black
- accessories: none
- avoid: sneakers, loose denim

### outfit_0094
- source: `0094.png`
- useCase: sailor, costume
- exposure: medium-high
- fit: cropped sailor top, loose pleated mini skirt
- outfitPrompt: `a navy sailor-style cropped top with a large red bow, navy pleated mini skirt, wrist cuff accessories, playful costume fit`
- colors: navy, red, white
- accessories: bow, wrist cuffs
- avoid: realistic workwear, long pants

### outfit_0095
- source: `0095.png`
- useCase: office, date
- exposure: low-medium
- fit: loose blouse, tight textured mini skirt
- outfitPrompt: `a black satin button blouse tucked into a white fuzzy textured bodycon mini skirt, office-date styling with loose glossy top and tight soft skirt`
- colors: black, white
- accessories: none
- avoid: swimsuit, fantasy outfit

### outfit_0096
- source: `0096.jpg`
- useCase: swim, adult
- exposure: high
- fit: tight high-cut one-piece
- outfitPrompt: `a white high-cut one-piece swimsuit with deep side openings and thin shoulder straps, very tight swimwear fit`
- colors: white
- accessories: none
- avoid: skirt, blazer

### outfit_0097
- source: `0097.jpg`
- useCase: maid, cute
- exposure: medium-high
- fit: tight camisole, loose sheer apron skirt
- outfitPrompt: `a pink maid-inspired mini dress with a fitted camisole top, tiny bow, white apron bib, sheer ruffled skirt, soft cute costume styling`
- colors: pink, white
- accessories: bow, apron
- avoid: business suit, sportswear

### outfit_0098
- source: `0098.png`
- useCase: lingerie, adult
- exposure: high
- fit: strappy lace bodysuit
- outfitPrompt: `a red strappy lace lingerie bodysuit with large chest bow, crisscross torso straps, high-cut leg openings, very tight adult fit`
- colors: red
- accessories: bow, straps
- avoid: casual outfit, long coat

### outfit_0099
- source: `0099.png`
- useCase: maid, adult
- exposure: high
- fit: tight velvet bodysuit, garter stockings
- outfitPrompt: `a black and white maid-inspired velvet bodysuit with white collar trim, lace-up sides, bow-tied garter stockings, tight costume fit`
- colors: black, white
- accessories: garters, bows
- avoid: casual denim, office realism

### outfit_0100
- source: `0100.png`
- useCase: athletic
- exposure: medium
- fit: tight sports bra, compression leggings
- outfitPrompt: `a white sports bra with pale pink high-waisted compression leggings, clean athletic tight fit, white striped socks`
- colors: white, pale pink
- accessories: striped socks
- avoid: dress, blazer

### outfit_0101
- source: `0101.png`
- useCase: corset, adult
- exposure: high
- fit: tight corset bodysuit, garter stockings
- outfitPrompt: `a black corset lingerie bodysuit with pink lace-up front, structured waist, garter stockings, tight hourglass costume fit`
- colors: black, pink
- accessories: corset lacing, garters
- avoid: casual realism

### outfit_0102
- source: `0102.jpg`
- useCase: maid, adult
- exposure: high
- fit: sheer off-shoulder top, frilled micro skirt
- outfitPrompt: `a sheer black off-shoulder maid-style top with bow ties, layered black and white ruffled micro skirt, fishnet stockings, tight costume styling`
- colors: black, white
- accessories: bows, fishnets
- avoid: office wear, sportswear

### outfit_0103
- source: `0103.png`
- useCase: date, adult
- exposure: high
- fit: tight mini dress
- outfitPrompt: `a black long-sleeve bodycon mini dress with white lace bust trim and front bow, very tight waist and hip fit, short hem`
- colors: black, white
- accessories: front bow
- avoid: loose dress, athletic wear

### outfit_0104
- source: `0104.png`
- useCase: adult, uniform-inspired
- exposure: high
- fit: tight sleeveless mini outfit
- outfitPrompt: `a black sleeveless uniform-inspired mini dress with white collar, deep chest cutout, garter stocking detail, tight short fit`
- colors: black, white
- accessories: collar, garter stockings
- avoid: casual realism

### outfit_0105
- source: `0105.png`
- useCase: adult, mesh
- exposure: high
- fit: full-body fishnet
- outfitPrompt: `a black full-body fishnet bodystocking, strapless upper edge, transparent net texture, extremely tight all-over fit`
- colors: black
- accessories: none
- avoid: outdoor casual, office outfit

### outfit_0106
- source: `0106.png`
- useCase: lingerie, adult
- exposure: high
- fit: tight lace teddy, garter stockings
- outfitPrompt: `a black lace lingerie teddy with sheer center panel, garter straps, black thigh-high stockings, tight adult silhouette`
- colors: black
- accessories: garters, stockings
- avoid: casual clothing, sportswear

### outfit_0107
- source: `0107.png`
- useCase: nightlife
- exposure: high
- fit: strapless crop top, tight mini skirt
- outfitPrompt: `a black strapless bandeau crop top with a front cutout, matching black bodycon mini skirt, minimal tight clubwear silhouette`
- colors: black
- accessories: none
- avoid: preppy skirt, office blouse

### outfit_0108
- source: `0108.png`
- useCase: lingerie, adult
- exposure: high
- fit: strappy minimal lingerie
- outfitPrompt: `a pink and white strappy lingerie set with heart-shaped cups, bow accents, minimal coverage, tight decorative strap fit`
- colors: pink, white, red
- accessories: bows, heart details
- avoid: casual realism

### outfit_0109
- source: `0109.jpg`
- useCase: sporty, casual
- exposure: medium
- fit: loose cropped jersey, flared pleated skirt
- outfitPrompt: `a red oversized cropped baseball jersey, white pleated tennis mini skirt, sporty casual fit with loose top and flared skirt`
- colors: red, white
- accessories: none
- avoid: lingerie, formal gown

### outfit_0110
- source: `0110.jpg`
- useCase: fantasy, anime
- exposure: medium
- fit: layered fantasy costume
- outfitPrompt: `a white and red fantasy battle-dress outfit with layered asymmetric skirt panels, thigh straps, decorative red ribbons, fitted bodice and flared costume silhouette`
- colors: white, red, black
- accessories: ribbons, thigh straps
- avoid: modern casual realism

### outfit_0112
- source: `0112.png`
- useCase: sci-fi, metallic
- exposure: medium-high
- fit: tight metallic mini dress
- outfitPrompt: `a silver metallic sci-fi mini dress with structured short sleeves, reflective panels, matching silver thigh-high boots and gloves, tight futuristic fit`
- colors: silver
- accessories: gloves, thigh-high boots
- avoid: cotton casual, school uniform

### outfit_0113
- source: `0113.png`
- useCase: lingerie, adult
- exposure: high
- fit: tight lace bodysuit
- outfitPrompt: `a black lace bodysuit with halter straps, sheer floral lace panels, black thigh-high stockings, tight adult costume fit`
- colors: black
- accessories: stockings
- avoid: everyday casual

### outfit_0114
- source: `0114.png`
- useCase: sci-fi, latex
- exposure: medium
- fit: full-body latex catsuit
- outfitPrompt: `a glossy black full-body latex catsuit with neon green circuit-like accents, extremely tight futuristic silhouette`
- colors: black, neon green
- accessories: glowing tech accents
- avoid: loose fabric, casual streetwear

### outfit_0115
- source: `0115.png`
- useCase: sci-fi, adult
- exposure: high
- fit: metallic pants, strappy top
- outfitPrompt: `a silver metallic high-waisted tight pant look with a strappy jeweled bikini-style top, glossy cyber styling, body-hugging lower fit`
- colors: silver, black, red
- accessories: jeweled straps, gloves
- avoid: preppy outfit, soft knit

### outfit_0116
- source: `0116.png`
- useCase: latex, adult
- exposure: high
- fit: glossy high-cut bodysuit
- outfitPrompt: `a black glossy latex high-cut bodysuit with red accents, tight reflective club-fantasy silhouette`
- colors: black, red
- accessories: gloves
- avoid: loose cotton, office wear

### outfit_0117
- source: `0117.png`
- useCase: uniform, fantasy
- exposure: medium
- fit: fitted blouse, pleated skirt
- outfitPrompt: `a white sleeveless fantasy blouse with black collar details, black pleated mini skirt with white trim, fitted school-fantasy styling`
- colors: white, black
- accessories: decorative trim
- avoid: swimwear, latex catsuit

### outfit_0118
- source: `0118.png`
- useCase: uniform, fantasy
- exposure: medium
- fit: loose cropped jacket, pleated mini skirt
- outfitPrompt: `a gray cropped one-sleeve uniform jacket over a black pleated mini skirt with red belt accents, fantasy school styling`
- colors: gray, black, red
- accessories: belt, decorative patches
- avoid: realistic office outfit

### outfit_0119
- source: `0119.png`
- useCase: fantasy, gothic
- exposure: medium-high
- fit: tight bodice, pleated skirt
- outfitPrompt: `a red and black gothic fantasy outfit with strappy fitted bodice, black pleated mini skirt, red garter straps, thigh-high stockings`
- colors: red, black
- accessories: garters, stockings
- avoid: casual denim

### outfit_0120
- source: `0120.png`
- useCase: gothic, adult
- exposure: high
- fit: tight bodysuit, loose cropped jacket
- outfitPrompt: `a black glossy bodysuit with a loose cropped black jacket, fishnet tights, gloves, gothic cyber club styling`
- colors: black
- accessories: gloves, fishnets
- avoid: soft preppy styling

### outfit_0121
- source: `0121.png`
- useCase: sci-fi, fantasy
- exposure: medium
- fit: fitted turtleneck top, short skirt
- outfitPrompt: `a teal ribbed turtleneck top with a gold asymmetrical armor-like skirt panel, black thigh-high stockings, futuristic fantasy styling`
- colors: teal, gold, black
- accessories: tech accents, thigh-high stockings
- avoid: realistic casual outfit

### outfit_0122
- source: `0122.png`
- useCase: adult, bodysuit
- exposure: high
- fit: strappy high-cut bodysuit
- outfitPrompt: `a black and silver strappy high-cut bodysuit with diagonal bands across the torso, tight glossy adult fantasy fit`
- colors: black, silver
- accessories: straps
- avoid: school uniform, daily casual

### outfit_0123
- source: `0123.png`
- useCase: latex, sci-fi
- exposure: medium
- fit: full-body latex suit
- outfitPrompt: `a hot pink glossy latex full-body suit with high collar and cropped jacket-like shoulder layer, extremely tight cyber styling`
- colors: hot pink, black
- accessories: glossy gloves
- avoid: cotton, loose skirt

### outfit_0124
- source: `0124.png`
- useCase: fantasy, bodysuit
- exposure: medium-high
- fit: tight white bodysuit
- outfitPrompt: `a white fantasy bodysuit with red and gold ornamental chest details, long gloves, thigh-high white stockings, tight costume silhouette`
- colors: white, red, gold
- accessories: gloves, stockings
- avoid: modern casual

### outfit_0125
- source: `02ae966ed0007a282abe2423cd9c4f27.jpg`, `f39933035f56483d82366881b942629b.jpg`
- useCase: uniform, anime
- exposure: low-medium
- fit: fitted blazer, short pleated skirt
- outfitPrompt: `a navy fitted school blazer with white shirt and red ribbon tie, short pleated skirt with reddish underskirt trim, black tights, polished anime-uniform styling`
- colors: navy, white, red, black
- accessories: ribbon tie, tights
- avoid: swimsuit, latex

### outfit_0126
- source: `06dad516766f9935e377a0367c8ad2e8466b8599a7a963e69b9e8c8979468455.jpg`
- useCase: gothic, street
- exposure: medium
- fit: fitted blouse, short skirt, chunky boots
- outfitPrompt: `a pale pink long-sleeve blouse layered under a black ruffled mini skirt or pinafore, black fishnet stockings, chunky knee-high boots, gothic cute street styling`
- colors: pale pink, black
- accessories: fishnet stockings, chunky boots
- avoid: office realism, swimwear

### outfit_0127
- source: `14aa3dddb1b163eb18936a7bd9e4a7aa.jpg`
- useCase: uniform, military
- exposure: low
- fit: structured coat, fitted waist
- outfitPrompt: `a red military-inspired long coat dress with black trim, gold buttons, fitted waist, black leggings, white boots, structured uniform silhouette`
- colors: red, black, gold, white
- accessories: boots
- avoid: casual denim, bikini

### outfit_0128
- source: `156e38c3140c100a73a3ba55ed54b90f.jpg`
- useCase: evening, date
- exposure: medium-high
- fit: tight draped dress
- outfitPrompt: `a coral-red draped slip mini dress with thin straps, soft cowl neckline, body-skimming tight fit, elegant evening styling`
- colors: coral red
- accessories: minimal jewelry
- avoid: sporty socks, school uniform

### outfit_0129
- source: `23d3a49b1b5e0df145631f2456f7e049.jpg`
- useCase: anime, casual
- exposure: medium
- fit: cropped tee, fitted denim shorts
- outfitPrompt: `a pale pink cropped short-sleeve shirt with a heart cutout, low-rise blue denim shorts with belt straps, playful anime casual styling`
- colors: pale pink, denim blue, black
- accessories: belt straps
- avoid: formal gown, office blouse

### outfit_0130
- source: `2a2c331b55e31cead6c38d84ef15d8eb.jpg`
- useCase: punk, anime
- exposure: medium
- fit: fitted jacket, pleated mini skirt
- outfitPrompt: `a pink and black punk school outfit with cropped jacket, pleated mini skirt, thigh straps, tall black boots, fitted rebellious anime styling`
- colors: pink, black, white
- accessories: thigh straps, boots
- avoid: soft office styling

### outfit_0131
- source: `2ec2a8cb9d8967378f8a3b6e23b0a1b0.jpg`
- useCase: street, graphic
- exposure: medium
- fit: oversized checkered jacket, tight crop top
- outfitPrompt: `an oversized black-and-white checkerboard jacket over a black crop top with heart cutout, blue jeans, edgy loose-over-tight street styling`
- colors: black, white, blue
- accessories: choker
- avoid: formal gown

### outfit_0132
- source: `34653ff1bc5a38e3c6f1ffe83e97856f.jpg`
- useCase: punk, anime
- exposure: medium
- fit: fitted vest, pleated mini skirt
- outfitPrompt: `a white school shirt with a purple tie, black vest, green pleated mini skirt, mismatched graphic thigh-high stockings, punk anime styling`
- colors: white, black, green, purple, pink, teal
- accessories: wrist cuffs, patterned stockings
- avoid: simple minimalist outfit

### outfit_0133
- source: `3b78751077582d30d94f5a8430b326ea.jpg`
- useCase: uniform, anime
- exposure: medium
- fit: fitted vest, tight mini skirt
- outfitPrompt: `a navy sleeveless uniform vest over a white mini skirt, pink bow at the chest, one black thigh-high sock, asymmetrical anime uniform styling`
- colors: navy, white, pink, black
- accessories: bow, single thigh-high sock
- avoid: realistic business suit

### outfit_0134
- source: `4e983bf3aaad88a90d2cf8a671767b4d.jpg`
- useCase: office, anime
- exposure: low-medium
- fit: sleeveless blouse, fitted shorts
- outfitPrompt: `a white sleeveless collared blouse tucked into black fitted knee-length shorts, slim office-casual anime styling`
- colors: white, black
- accessories: black ribbon collar
- avoid: lingerie, swimsuit

### outfit_0135
- source: `5cc2a3e6b8c2ee4da77c50ff70151538.jpg`
- useCase: gothic, anime
- exposure: medium
- fit: loose oversized sweater, short skirt
- outfitPrompt: `a white oversized knit sweater with lace-up sleeve details, black mini skirt peeking underneath, dark red hem trim, gothic cute styling`
- colors: white, black, dark red
- accessories: cross necklace, thigh strap
- avoid: office suit, sporty leggings

### outfit_0136
- source: `757564556.jpg`, `Gemini_Generated_Image_c66qsoc66qsoc66q.png`
- useCase: fantasy, costume
- exposure: medium-high
- fit: fitted bodice, ruffled mini skirt
- outfitPrompt: `a white and red fantasy jester-maid outfit with fitted bodice, red plaid center panel, black ruffled mini skirt, long black gloves, thigh-high stockings, chunky platform shoes`
- colors: white, red, black, green
- accessories: gloves, stockings, platform shoes
- avoid: modern casual realism

### outfit_0137
- source: `80f7df53464c76f470e26a7141fddeba.jpg`
- useCase: gothic, maid
- exposure: low-medium
- fit: fitted bodice, very full skirt
- outfitPrompt: `a black gothic maid dress with white apron, puff sleeves, layered full skirt, black patterned stockings, chunky shoes, voluminous Victorian maid silhouette`
- colors: black, white
- accessories: apron, stockings
- avoid: bodycon clubwear

### outfit_0138
- source: `86e7bc3ba5e41c75242c58e6caab56b4.jpg`
- useCase: uniform, navy
- exposure: medium
- fit: fitted sailor top, pleated skirt
- outfitPrompt: `a navy sailor-style mini uniform with white trim, pleated skirt, white thigh-high stockings, fitted top and flared short skirt`
- colors: navy, white
- accessories: thigh-high stockings
- avoid: latex, swimwear

### outfit_0139
- source: `9218311734_486616_22c7bbfe5ba304d7b4e0207b906f6c48.jpeg`
- useCase: preppy, dress
- exposure: low
- fit: fitted sleeveless mini dress
- outfitPrompt: `a cream sleeveless collared mini dress with navy skirt panel and thin red ribbon tie, neat preppy A-line silhouette`
- colors: cream, navy, red
- accessories: ribbon tie
- avoid: lingerie, latex

### outfit_0140
- source: `9218311734_486616_306efd2abfa34ca5d36e5826a4fd6245.jpeg`
- useCase: cute, dress
- exposure: low
- fit: fitted waist, flared skirt
- outfitPrompt: `a pale pink short-sleeve collared mini dress with button front, black trim, fitted waist and softly flared skirt`
- colors: pale pink, black
- accessories: none
- avoid: adult costume, swimwear

### outfit_0141
- source: `9218311734_486616_779b26f76311fc39e00b4a255dda8a50.jpeg`
- useCase: coat, dress
- exposure: low
- fit: straight long coat dress
- outfitPrompt: `a black long coat dress with red piping, high collar, front zipper, long sleeves, structured straight silhouette`
- colors: black, red
- accessories: ribbon collar
- avoid: swimsuit, crop top

### outfit_0142
- source: `9218311734_486616_99b983892094b5c6d2fc3736e15da7d1.jpeg`
- useCase: romantic, floral
- exposure: low
- fit: loose A-line dress
- outfitPrompt: `a black long-sleeve A-line dress with floral embroidery at the hem and sleeves, cream collar bow detail, loose romantic silhouette`
- colors: black, cream, floral red and green
- accessories: bow collar
- avoid: bodycon mini dress, latex

### outfit_0143
- source: `9218311734_486616_99b983892094b5c6d2fc3736e15da7d1_1.jpeg`
- useCase: romantic, floral
- exposure: low
- fit: loose tiered dress
- outfitPrompt: `a white floral long-sleeve tiered dress with black ribbon trim, frilled layers, airy loose romantic silhouette`
- colors: white, floral pink, black
- accessories: ribbon trim
- avoid: sporty leggings, bikini

### outfit_0144
- source: `9218311734_486616_a5727f70b0b24fdeb465864cbcdc9a00.jpeg`
- useCase: romantic, floral
- exposure: low
- fit: long flowing dress
- outfitPrompt: `a pale floral long dress with soft ruffled layers, long sleeves, high waist, flowing romantic fit`
- colors: pale pink, cream, floral pastel
- accessories: none
- avoid: leather, latex, crop top

### outfit_0145
- source: `9218311734_486616_a85145b13dc9b8dc61c5b614253fcead.jpeg`
- useCase: blouse, romantic
- exposure: low-medium
- fit: loose oversized blouse
- outfitPrompt: `a cream oversized blouse with a large lavender bow at the collar, gathered front tie, loose soft romantic fit`
- colors: cream, lavender
- accessories: large bow
- avoid: tight bodycon, swimwear

### outfit_0146
- source: `9218311734_486616_a95b2941d04215ec459138cf5701ec41.jpeg`
- useCase: blouse, preppy
- exposure: low
- fit: regular fitted shirt
- outfitPrompt: `a white long-sleeve button shirt with red and navy trim at the cuffs and placket, large navy and red bow at the collar, clean preppy blouse fit`
- colors: white, navy, red
- accessories: bow collar
- avoid: lingerie, swimsuit

### outfit_0147
- source: `9218311734_486616_b9a3c748d24fd152dd9c8883735fff45.jpeg`
- useCase: romantic, dress
- exposure: low
- fit: fitted waist, long dress
- outfitPrompt: `a coral sleeveless long dress with front ruffle trim, black waist ribbon, fitted waist and long straight romantic skirt`
- colors: coral, black
- accessories: waist ribbon
- avoid: bodycon clubwear

### outfit_0148
- source: `9218311734_486616_d530c4cef3841ba83e0a2a33e5f62cf2.jpeg`
- useCase: blouse, gothic
- exposure: low
- fit: loose blouse
- outfitPrompt: `a black long-sleeve blouse with white ruffled collar, cream placket, red ribbon bow, loose gothic preppy fit`
- colors: black, white, cream, red
- accessories: bow, ruffled collar
- avoid: swimwear, sportswear

### outfit_0149
- source: `95d7dfb821ca19fc7775ee8b5417a5ab.jpg`
- useCase: anime, layered
- exposure: medium
- fit: cropped fitted top, belted pleated skirt
- outfitPrompt: `a mint-green loose-sleeve cropped jacket over a white lace-up top, high-waisted pink pleated skirt with wide black belt, layered anime street styling`
- colors: mint, white, pink, black
- accessories: wide belt
- avoid: minimalist office wear

### outfit_0150
- source: `a2d34abe11d2520cc159529d4d6c21ba.jpg`
- useCase: gothic, fantasy
- exposure: medium
- fit: fitted bodice, high-low skirt
- outfitPrompt: `a black gothic high-low dress with red lining, fitted bodice, choker straps, thigh-high stockings, dark fantasy silhouette`
- colors: black, red
- accessories: choker, stockings
- avoid: casual cotton

### outfit_0151
- source: `a9cc9fad9b1a4a7d9d822c34dd834a47.jpg`
- useCase: gothic, maid
- exposure: medium
- fit: fitted bodice, layered ruffled skirt
- outfitPrompt: `a black and white gothic maid outfit with layered ruffled skirt, red tie, black thigh-high stockings, platform Mary Jane shoes, fitted bodice with wide skirt volume`
- colors: black, white, red
- accessories: stockings, platform shoes
- avoid: modern office wear

### outfit_0152
- source: `c242d38abff200bbd68808207a9f20ad.jpg`
- useCase: school, uniform
- exposure: low-medium
- fit: fitted cardigan, pleated mini skirt
- outfitPrompt: `a red cardigan over a black shirt and striped tie, navy plaid pleated mini skirt, black sheer tights, school uniform styling`
- colors: red, black, navy
- accessories: tie, tights
- avoid: swimwear, lingerie

### outfit_0153
- source: `c75929a5e876677931380ad41070c827.jpg`
- useCase: anime, uniform
- exposure: low-medium
- fit: fitted blazer, pleated skirt
- outfitPrompt: `a red fitted school blazer with black trim, navy plaid pleated skirt, black tights, polished anime uniform silhouette`
- colors: red, navy, black
- accessories: tights
- avoid: casual streetwear

### outfit_0154
- source: `ChatGPT Image 2026년 4월 22일 오후 09_08_14.png`, `ChatGPT Image 2026년 4월 22일 오후 09_08_14 - 복사본.png`
- useCase: gothic, street
- exposure: medium
- fit: loose graphic top, pleated mini skirt
- outfitPrompt: `a black graphic oversized tee layered with a black pleated mini skirt, chain belt, white leg warmers, chunky black platform shoes, messy gothic street styling`
- colors: black, white, gray
- accessories: chain belt, leg warmers, platform shoes
- avoid: formal gown, office suit

### outfit_0155
- source: `d5d45d454.jpg`
- useCase: anime, summer
- exposure: medium
- fit: fitted camisole, flared mini skirt
- outfitPrompt: `a white strappy camisole mini dress with fitted bust and flared short skirt, simple summer anime date styling`
- colors: white
- accessories: heels
- avoid: heavy coat, latex

### outfit_0156
- source: `eed3ea34ce7738e3eedf559212a7d33e.jpg`
- useCase: knit, adult
- exposure: medium-high
- fit: tight ribbed bodycon dress
- outfitPrompt: `a white ribbed long-sleeve bodycon dress with deep neckline, knee-to-midi length, extremely tight knit fit, small black handbag`
- colors: white, black
- accessories: small handbag
- avoid: loose fit, school skirt

### outfit_0157
- source: `Gemini_Generated_Image_gdabkgdabkgdabkg.png`
- useCase: formal, floral
- exposure: medium-high
- fit: tight high-slit skirt, fitted top
- outfitPrompt: `a black fitted long-sleeve top paired with a high-waisted floral satin wrap skirt, dramatic thigh-high slit, tight elegant silhouette`
- colors: black, floral pink and green
- accessories: black heels
- avoid: sporty casual, school uniform

### outfit_0158
- source: `Gemini_Generated_Image_x0air2x0air2x0ai.png`
- useCase: denim, casual
- exposure: medium
- fit: fitted tank, loose denim jacket, fitted shorts
- outfitPrompt: `a white fitted sleeveless tank top, light blue denim jacket worn loose off the shoulders, high-waisted denim shorts, beige belt, casual denim-on-denim styling`
- colors: white, light blue, beige
- accessories: belt, denim jacket
- avoid: latex, evening gown

### outfit_0159
- source: `화면 캡처 2025-10-03 192238.png`
- useCase: gothic, nightlife
- exposure: high
- fit: tight lace corset top, flared mini skirt
- outfitPrompt: `a black lace corset crop top with thin straps and front lacing, black flared mini skirt, dark gothic club styling, tight upper body with short flared lower silhouette`
- colors: black
- accessories: lace-up corset
- avoid: casual office wear, sports leggings

## Category Filters

### safest_for_daily_random
- outfit_0001
- outfit_0003
- outfit_0005
- outfit_0021
- outfit_0025
- outfit_0026
- outfit_0034
- outfit_0037
- outfit_0039
- outfit_0040
- outfit_0041
- outfit_0047
- outfit_0048
- outfit_0055
- outfit_0061
- outfit_0062
- outfit_0064
- outfit_0069
- outfit_0071
- outfit_0072
- outfit_0073
- outfit_0081
- outfit_0085
- outfit_0087
- outfit_0095
- outfit_0109
- outfit_0139
- outfit_0140
- outfit_0142
- outfit_0143
- outfit_0144
- outfit_0145
- outfit_0146
- outfit_0148
- outfit_0154
- outfit_0158

### adult_or_high_exposure_only
- outfit_0002
- outfit_0006
- outfit_0008
- outfit_0011
- outfit_0012
- outfit_0013
- outfit_0015
- outfit_0016
- outfit_0018
- outfit_0019
- outfit_0042
- outfit_0045
- outfit_0049
- outfit_0053
- outfit_0054
- outfit_0056
- outfit_0058
- outfit_0074
- outfit_0076
- outfit_0077
- outfit_0079
- outfit_0082
- outfit_0083
- outfit_0089
- outfit_0091
- outfit_0092
- outfit_0093
- outfit_0096
- outfit_0098
- outfit_0099
- outfit_0101
- outfit_0102
- outfit_0103
- outfit_0104
- outfit_0105
- outfit_0106
- outfit_0107
- outfit_0108
- outfit_0113
- outfit_0115
- outfit_0116
- outfit_0120
- outfit_0122
- outfit_0156
- outfit_0159

### fantasy_or_cosplay_only
- outfit_0066
- outfit_0080
- outfit_0088
- outfit_0094
- outfit_0097
- outfit_0110
- outfit_0112
- outfit_0114
- outfit_0117
- outfit_0118
- outfit_0119
- outfit_0121
- outfit_0123
- outfit_0124
- outfit_0125
- outfit_0127
- outfit_0129
- outfit_0130
- outfit_0131
- outfit_0132
- outfit_0133
- outfit_0135
- outfit_0136
- outfit_0137
- outfit_0138
- outfit_0149
- outfit_0150
- outfit_0151
- outfit_0152
- outfit_0153
