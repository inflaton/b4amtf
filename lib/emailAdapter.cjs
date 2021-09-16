const emailAdapter = {
  module: 'parse-smtp-template',
  options: {
    port: process.env.SMTP_PORT || 587,
    host: process.env.SMTP_SERVER || "smtp-mail.outlook.com",
    user: process.env.SMTP_LOGIN || process.env.OUTLOOK_USER,
    password: process.env.SMTP_PASSWORD || process.env.OUTLOOK_PASSWORD,
    fromAddress: process.env.OUTLOOK_USER,

    multiTemplate: true,
    confirmTemplatePath: "views/templates/verification_email.html",
    passwordTemplatePath: "views/templates/password_reset_email.html",

    // Custom options to your emails
    // You can add as much as you need
    passwordOptions: {
      subject: "Password recovery 重置密码",
      body: "Custom password recovery email body",
      btn: "Recover your password"
    },
    confirmOptions: {
      subject: "verify your e-mail 确认电邮地址",
      body: "Custom email confirmation body",
      btn: "confirm your email"
    },
  }
};

module.exports = emailAdapter;
