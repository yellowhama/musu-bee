import defaultCompanyTemplateJson from "./defaultCompanyTemplate.json";

export type DefaultCompanyTemplate = {
  templateKey: string;
  version: string;
  summary: string;
  goals: string[];
  starterProjects: string[];
  defaultAgents: string[];
  maintenance: string[];
  issueClasses: string[];
  bootstrapChecklist: string[];
  boardCommentContract: {
    requiredFields: string[];
    conditionalFields: string[];
  };
  reportingCadence: string[];
};

export const defaultCompanyTemplate =
  defaultCompanyTemplateJson as DefaultCompanyTemplate;
