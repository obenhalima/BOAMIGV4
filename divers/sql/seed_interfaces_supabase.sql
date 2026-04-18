-- ═══════════════════════════════════════════════════════════
-- SEED : interfaces techniques BOA CI (GAP Analysis 2026)
-- Table : app_defaults  |  Clé : 'interfaces'
-- ═══════════════════════════════════════════════════════════
INSERT INTO app_defaults (key, data, updated_at)
VALUES (
  'interfaces',
  '[
  {
    "id": "iface_boaci_siron",
    "name": "BOACI SIRON",
    "status": "done",
    "impact": "no_impact",
    "comments": [],
    "actions": [],
    "resp": "",
    "targetDate": ""
  },
  {
    "id": "iface_boaci_fiabilisation_kyc",
    "name": "BOACI_FIABILISATION KYC",
    "status": "done",
    "impact": "no_impact",
    "comments": [
      "📋 CBS : There is a table mentioned as CBS_STANDARD but it starts with BOA_ — we think this is an error from BOA''s end. If the assumption is correct, then NO IMPACT.",
      "🏦 BOA : The assumption is correct."
    ],
    "actions": [],
    "resp": "",
    "targetDate": ""
  },
  {
    "id": "iface_boaci_quantum",
    "name": "BOACI_Quantum",
    "status": "done",
    "impact": "no_impact",
    "comments": [],
    "actions": [],
    "resp": "",
    "targetDate": ""
  },
  {
    "id": "iface_boa_web_and_my_boa",
    "name": "BOA WEB & MY BOA",
    "status": "done",
    "impact": "multiple",
    "comments": [
      "📋 CBS : The interface reads/updates on table columns that do not exist in our standard — more info requested (some lines may be wrongly filled – BOA to confirm).",
      "📋 CBS : Two non-recommended patterns spotted: direct update on table STATE, and direct insert/update on MVTD/MVTD_NUIT — more info requested. While they technically work, they are not recommended and might lead to issues in both IGOR and CapitalBanker.",
      "📋 CBS : Update of the file is in progress.",
      "🏦 BOA : Update instruction done in VARCHAC process: UPDATE BOANI.STATE SET NVIRCH = NVIRCH + 1 WHERE vREFREG IS NULL.",
      "🏦 BOA : The insert instructions are done on MVTD and on MVTD_NUIT to create the transfer operation."
    ],
    "actions": [],
    "resp": "",
    "targetDate": ""
  },
  {
    "id": "iface_boa_ci_frontaux",
    "name": "BOA CI Frontaux",
    "status": "done",
    "impact": "multiple",
    "comments": [
      "📋 CBS : The interface reads/updates on table columns that do not exist in our standard — more info requested.",
      "📋 CBS : Direct update on table STATE spotted (not recommended in IGOR nor CapitalBanker V4).",
      "📋 CBS : Update on table PERS which became a view in CapitalBanker — updates no longer possible. A set of normalized tables have been created instead. CBS needs to understand the need and provide guidance.",
      "📋 CBS : Usage of obsolete tables: PERSACCESS and REMDIB — no longer maintained in V4. CBS to provide information about alternative tables.",
      "🏦 BOA : Update of the file is in progress."
    ],
    "actions": [],
    "resp": "",
    "targetDate": ""
  },
  {
    "id": "iface_smart_vista",
    "name": "Smart Vista",
    "status": "done",
    "impact": "minor",
    "comments": [
      "📋 CBS : CODAUTO does not exist in standard table OPERCB.",
      "📋 CBS : One non-recommended pattern: direct update on table MVTD_NUIT — more info requested. While technically working, not recommended and might lead to issues.",
      "🏦 BOA : Meeting requested on 25.03.2026 to discuss the action plan."
    ],
    "actions": [],
    "resp": "",
    "targetDate": ""
  },
  {
    "id": "iface_middleware",
    "name": "Middleware",
    "status": "pending_boa",
    "impact": "tbd",
    "comments": [
      "📋 CBS : Pending correction from BOA on the content of the Excel.",
      "🏦 BOA : Proposed to remove from this scope as all flows are covered by other satellites and open a separate discussion for CapitalConnect migration on 25.03.2026."
    ],
    "actions": [],
    "resp": "",
    "targetDate": ""
  },
  {
    "id": "iface_cycle_de_vie",
    "name": "Cycle de vie",
    "status": "done",
    "impact": "no_impact",
    "comments": [
      "📋 CBS : Based on BOA: no call to CBS standard objects."
    ],
    "actions": [],
    "resp": "",
    "targetDate": ""
  },
  {
    "id": "iface_collect",
    "name": "Collect",
    "status": "pending_boa",
    "impact": "tbd",
    "comments": [
      "📋 CBS : Pending correction from BOA on the content of the Excel.",
      "🏦 BOA : Non standard CBS objects in Collect (e.g., Table Cli, Cpt... or standard procedures). CBS to confirm there is no impact."
    ],
    "actions": [],
    "resp": "",
    "targetDate": ""
  },
  {
    "id": "iface_docflow",
    "name": "DocFlow",
    "status": "pending_boa",
    "impact": "tbd",
    "comments": [
      "📋 CBS : Pending correction from BOA on the content of the Excel.",
      "🏦 BOA : The update of the file is in progress."
    ],
    "actions": [],
    "resp": "",
    "targetDate": ""
  },
  {
    "id": "iface_locale_ci_cic_ccm_compense",
    "name": "Locale CI – CIC-CCM (Compense)",
    "status": "done",
    "impact": "no_impact",
    "comments": [],
    "actions": [],
    "resp": "",
    "targetDate": ""
  },
  {
    "id": "iface_locale_ci_finarchive",
    "name": "Locale CI – FINARCHIVE",
    "status": "done",
    "impact": "no_impact",
    "comments": [],
    "actions": [],
    "resp": "",
    "targetDate": ""
  },
  {
    "id": "iface_locale_ci_infocentre",
    "name": "Locale CI – INFOCENTRE",
    "status": "done",
    "impact": "no_impact",
    "comments": [
      "📋 CBS : None of the mentioned objects is a CBS standard."
    ],
    "actions": [],
    "resp": "",
    "targetDate": ""
  },
  {
    "id": "iface_locale_ci_swift",
    "name": "Locale CI – SWIFT",
    "status": "done",
    "impact": "no_impact",
    "comments": [
      "📋 CBS : As per BOA document ''satellites impact analysis'': no CBS objects invoked."
    ],
    "actions": [],
    "resp": "",
    "targetDate": ""
  },
  {
    "id": "iface_locale_ci_bank_bi",
    "name": "Locale CI – BANK-BI",
    "status": "done",
    "impact": "no_impact",
    "comments": [],
    "actions": [],
    "resp": "",
    "targetDate": ""
  },
  {
    "id": "iface_locale_ci_xcipprod",
    "name": "Locale CI – XCIPProd",
    "status": "pending_boa",
    "impact": "tbd",
    "comments": [
      "📋 CBS : Please answer the question asked in Excel in column ''Comments 16.03.2026''.",
      "🏦 BOA : Attached: sh program handling CIP file generation and pk_cip_body.sql file."
    ],
    "actions": [],
    "resp": "",
    "targetDate": ""
  },
  {
    "id": "iface_locale_ci_depassement",
    "name": "Locale CI – Depassement",
    "status": "done",
    "impact": "minor",
    "comments": [
      "📋 CBS : One impact on PERS profile — to check with the migration of users management.",
      "🏦 BOA : Meeting requested on 25.03.2026 to discuss the action plan."
    ],
    "actions": [],
    "resp": "",
    "targetDate": ""
  },
  {
    "id": "iface_locale_ci_sms",
    "name": "Locale CI – SMS",
    "status": "done",
    "impact": "no_impact",
    "comments": [],
    "actions": [],
    "resp": "",
    "targetDate": ""
  },
  {
    "id": "iface_locale_ci_cocotier",
    "name": "Locale CI – COCOTIER",
    "status": "done",
    "impact": "no_impact",
    "comments": [
      "📋 CBS : Confirmed by BOA that objects are BOA specific — no impact."
    ],
    "actions": [],
    "resp": "",
    "targetDate": ""
  },
  {
    "id": "iface_locale_ci_signature",
    "name": "Locale CI – Signature",
    "status": "done",
    "impact": "minor",
    "comments": [
      "📋 CBS : One impact on PERS profile — to check with the migration of users management.",
      "🏦 BOA : Meeting requested on 25.03.2026 to discuss the action plan."
    ],
    "actions": [],
    "resp": "",
    "targetDate": ""
  },
  {
    "id": "iface_locale_ci_virfile",
    "name": "Locale CI – VIRFILE",
    "status": "done",
    "impact": "minor",
    "comments": [
      "📋 CBS : One impact on PERS profile — to check with the migration of users management.",
      "🏦 BOA : Meeting requested on 25.03.2026 to discuss the action plan."
    ],
    "actions": [],
    "resp": "",
    "targetDate": ""
  },
  {
    "id": "iface_locale_ci_change",
    "name": "Locale CI – Change",
    "status": "done",
    "impact": "minor",
    "comments": [
      "📋 CBS : One impact on PERS profile — to check with the migration of users management.",
      "🏦 BOA : Meeting requested on 25.03.2026 to discuss the action plan."
    ],
    "actions": [],
    "resp": "",
    "targetDate": ""
  },
  {
    "id": "iface_locale_ci_cergi",
    "name": "Locale CI – CERGI",
    "status": "done",
    "impact": "no_impact",
    "comments": [],
    "actions": [],
    "resp": "",
    "targetDate": ""
  },
  {
    "id": "iface_locale_ci_sage",
    "name": "Locale CI – SAGE",
    "status": "done",
    "impact": "no_impact",
    "comments": [
      "📋 CBS : As per BOA document ''satellites impact analysis'': no database objects, so no impact."
    ],
    "actions": [],
    "resp": "",
    "targetDate": ""
  },
  {
    "id": "iface_locale_ci_exc",
    "name": "Locale CI – EXC",
    "status": "done",
    "impact": "no_impact",
    "comments": [
      "📋 CBS : As per BOA document ''satellites impact analysis'': no database objects, so no impact."
    ],
    "actions": [],
    "resp": "",
    "targetDate": ""
  },
  {
    "id": "iface_locale_ci_nbu",
    "name": "Locale CI – NBU",
    "status": "done",
    "impact": "no_impact",
    "comments": [
      "📋 CBS : As per BOA document ''satellites impact analysis'': no database objects, so no impact."
    ],
    "actions": [],
    "resp": "",
    "targetDate": ""
  }
]' ::jsonb,
  NOW()
)
ON CONFLICT (key) DO UPDATE
  SET data       = EXCLUDED.data,
      updated_at = NOW();
