declare module "nodemailer" {
  const nodemailer: {
    createTransport(options: unknown): {
      sendMail(message: unknown): Promise<{ messageId?: string }>;
    };
  };

  export default nodemailer;
}
