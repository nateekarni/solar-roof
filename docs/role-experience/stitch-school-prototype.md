# School User — Google Stitch prototype

Created 2026-10-06 using Google Stitch MCP.

Project: https://stitch.withgoogle.com/projects/18405901547603576301

Design system: assets/f470a2ef6f4c41f68afba4d22b968387

## Scope

## User-approved revision: integrated campus flow

Home on mobile and desktop uses a semi-realistic school campus scene with rooftop solar panels, visible inverter, and directional energy paths. Anchor the sample 42.8 kW power label at the rooftop; integrate daily 196.4 kWh and monthly 1,234 kWh summaries near the lower edge. Do not interpret school labels as measured consumption. Preserve remaining chart and billing layouts.

Mobile bottom navigation: active icon and label emerald, transparent item background with no pill/box; inactive icon and label muted foreground. Applied to home, production, and invoice screens. Stitch performed in-place DOM edits; static screenshot export URLs may still refer to the earlier renders. See live project for current design. DOM change records are saved in stitch-flow-revision.json.

Thai mobile-first School User experience: home with solar school illustration, production chart and conceptual energy flow; production details explaining kW/kWh; invoice and payment evidence steps; desktop dashboard. Warm ivory, emerald, amber, rounded cards and four primary destinations.

All readings, invoice values and identities are fictional. These are generated design screens, not connected app functionality. Responsive behavior and accessibility still need implementation and browser testing. No production source code was modified for this experiment.

## Screens

- **หน้าแรก - Solar School** — projects/18405901547603576301/screens/fa4f29d0b3d74ffdb24148b9dd30537a
  - [Preview](https://lh3.googleusercontent.com/aida/AEtjO1WC81U8Y26gVmJkHbK5Dc_GHPERFT8ZG0pUWXFVKg5LR174DZWKkcLHSf99OgO5WsSRrEMELTPLHAmFMRJIi1d4fUmEZ6iZxYdkfzFoE8X-vGl1Z6dXCf1PqrAb9wMcHp7KNjZciv7ZL2Op7Bjzig1K5QNPStp5iEi2vMtTUj9E9ZnbEOY2WJEIcVM32lx3v4bEAIvN97dw5ciY7pydqyazDTg9lUr0e-6guS_yPyuDazftGiwbWo5a2KeV=s1600)
  - [Generated HTML](https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ8Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpbCiVodG1sXzRmYzg0ZTRhNTA2ZDRmYWJiZTJkODlkNDFiZGMyM2UzEgsSBxC29Kan2w8YAZIBJAoKcHJvamVjdF9pZBIWQhQxODQwNTkwMTU0NzYwMzU3NjMwMQ&filename=&opi=96797242)
- **การผลิตไฟฟ้า - Solar School** — projects/18405901547603576301/screens/338ef965fca048b29ac7751848fe1429
  - [Preview](https://lh3.googleusercontent.com/aida/AEtjO1WJPoHSAd8RRL13_I_djoE5h2TnE3cR-cSOwYKE4mB-muUQW-cuGrOgk3uQSw9uu8tDq6Ej7SiCjIeK-vJmcLoP_MvZJSuzwTzMXy58M2xoPpd_xFRUXBOXNGKtLoG9dnKlmcOUwzh0D0F-nOknt9HXJ7hzMI5kz2cR-qCwucdEuLHTrM_GAtvRkZaIwhrh1J03xegVa-k3PdqaB1I0075QwMAAzo7kEqPCYySXXKQfaO0jWMk95D4lrz8q=s1600)
  - [Generated HTML](https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ8Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpbCiVodG1sX2M2NGY4NjQwNGU4NDQzZDg5MjZhYTZmNGMyOWQwYWMwEgsSBxC29Kan2w8YAZIBJAoKcHJvamVjdF9pZBIWQhQxODQwNTkwMTU0NzYwMzU3NjMwMQ&filename=&opi=96797242)
- **ใบแจ้งหนี้และการแนบหลักฐาน - Solar School** — projects/18405901547603576301/screens/22e1437856ba4126b7e36eff89d84d63
  - [Preview](https://lh3.googleusercontent.com/aida/AEtjO1XcX1bQmMlN5WeC5NYihN0U706lLDDjM51Bh4qFFpwy0r_N1JROiXYuLfSd9ajPcCoCLM3Rt7S3f_JKfesj3ud9Y2KD77Bw5an5C_y18OFFK2WcjkmhB5WdJSQoL22ofqNi9T4Q7-0r8CVkG1vefEPBCilLRHLh0Jadkh0k28AM9DzqvFGPCDexKcA8SrdAqrf5i2Nkl3XrlcL96wqqUp6eN3Az-jeyirDV3m3T2dckSn9_zomUu4XTqEev=s1600)
  - [Generated HTML](https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ8Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpbCiVodG1sXzQ2NzJhMGVhNzliYTRjNjBiZDVkMWVjM2ZkYjcyZTRkEgsSBxC29Kan2w8YAZIBJAoKcHJvamVjdF9pZBIWQhQxODQwNTkwMTU0NzYwMzU3NjMwMQ&filename=&opi=96797242)
- **แดชบอร์ดพลังงานแสงอาทิตย์ - Solar School** — projects/18405901547603576301/screens/5fc4dfa880984d11b6e88db1623f05a4
  - [Preview](https://lh3.googleusercontent.com/aida/AEtjO1X-57uJCg-9sNbN23HdOvrr34zdhOkseXYWgtpB3QURkEe63zk9eUB8y4Sbq5jxO0CWXNp-ags8IiLExDoJ5UOk4_BDusgkN8Lqi--9VUivHb9HawUxv4L4Y_YQYmYL-SzE3ny2rduMgYF7SwJ2_EftUjGYdhg550JJvnCtMADl0-aspYY28naNSWj-9ZH8fZf4c7rwN018TrHaQuaB7wEB2_3A6ug_0MVEzUcqNqu3TSoddVeScKT6bVBH=s1600)
  - [Generated HTML](https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ8Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpbCiVodG1sX2JhMTRiMmViNzQ3YjQ5MTI5NjJhNjUwNTUzYmMzOWZhEgsSBxC29Kan2w8YAZIBJAoKcHJvamVjdF9pZBIWQhQxODQwNTkwMTU0NzYwMzU3NjMwMQ&filename=&opi=96797242)

## Implementation notes

### Refined desktop

- [Clean modern isometric 3D vector illustration of a school building with sleek blue rooftop solar panels, gentle warm sunlight shining down with subtle dotted energy flow curved path from sun to rooftop solar panels, to an inverter box next to the building wall, and entering the modern classroom building. Lush green trees, minimalist lawn, clear clean warm ivory white background, premium emerald green and golden amber accents, clean flat shaded architectural rendering style, no text, no numerical labels, elegant and friendly educational solar theme.](https://lh3.googleusercontent.com/aida/AEtjO1V-j-iDnIcUWZ8vXVsTOTxpv5oYYhhIPg2UDGX91VN0rl-csPJe4ctxz186HDzZKRdZ6eWjwkL9T-Mzd4mTS26nWp29tLUOA73A-LBAaSjJ2oXBndAqULt3q429hLcFx6ThAmazpZ990d6-uDNfTQ2qmKgi82NJLSdO4zTrDxOS6kPvAepDROmbOZ8tztqXHoWj-743pkVLV3EASFba7fFho7fHX7Xx4yX7sIXgeufQKqvktY_bPibjbURQ=s1600) — projects/18405901547603576301/screens/ded3b3217f5e4590b806f1774b11c399
- [แดชบอร์ดพลังงานแสงอาทิตย์ - Solar School](https://lh3.googleusercontent.com/aida/AEtjO1Wphp7oSr9Yme6M5Vc8CCyZHDwN5aJ9Y_9-w7ihjZzHV2_7qx2E_Ny4XFTDmVx3cWWDgj3z50P87b0KhbAqfD6OS0MEKJOVWQLbsvXwgtAtF6vWNtdLKlSr5MmMrW_J2XNXU8YBvITnup_ZCD_b36bGSR8RD3RHfvD4ZLd6a4jXXT_-wK7oWJc50WyeA5P7JRc6PRT81iM07g6H6GRU3HmOeTbNDYAxWO00d69lkEKuny7FQKp1UK9SpAek=s1600) — projects/18405901547603576301/screens/a6872ade7a814ce898d927ff5bc7275e

Use verified school identity and existing access controls. Map power and energy from real API fields. Conceptual arrows must not imply measured school consumption. Do not add grid, battery, savings, CO2, efficiency or equipment measurements without an actual data source. Stitch initially introduced unsupported capacity/efficiency/target figures on desktop; a refinement removes them. Invoice rate and energy rows generated by Stitch are placeholders and must be replaced by actual invoice data. Mobile and desktop layouts are visual targets rather than proof of responsive functionality.
