import i18next from "i18next";
import { initReactI18next } from "react-i18next";

export const resources = {
  en: {
    translation: {
      appName: "QMS",
      subtitle: "Open-source queue management",
      admin: "Admin",
      staff: "Staff",
      kiosk: "Kiosk",
      display: "Display",
      customer: "Customer",
      callNext: "Call next",
      start: "Start",
      complete: "Complete",
      noShow: "No-show",
      createTicket: "Create ticket",
      waiting: "Waiting",
      called: "Called",
      serving: "Serving",
      chooseService: "Choose a service",
      yourTicket: "Your ticket",
      mainBranch: "Main Branch"
    }
  },
  ar: {
    translation: {
      appName: "QMS",
      subtitle: "نظام مفتوح المصدر لإدارة الطوابير",
      admin: "الإدارة",
      staff: "الموظفون",
      kiosk: "الكشك",
      display: "الشاشة",
      customer: "العميل",
      callNext: "استدعاء التالي",
      start: "بدء الخدمة",
      complete: "إنهاء",
      noShow: "لم يحضر",
      createTicket: "إصدار تذكرة",
      waiting: "بانتظار",
      called: "تم الاستدعاء",
      serving: "قيد الخدمة",
      chooseService: "اختر الخدمة",
      yourTicket: "تذكرتك",
      mainBranch: "الفرع الرئيسي"
    }
  }
} as const;

void i18next.use(initReactI18next).init({
  resources,
  lng: "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false }
});

export default i18next;

