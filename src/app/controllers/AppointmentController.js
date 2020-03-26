/* eslint-disable prettier/prettier */
import * as Yup from 'yup';
import { startOfHour, parseISO, isBefore, format } from 'date-fns';
import pt from 'date-fns/locale/pt';
import User from '../models/User';
import File from '../models/File';
import Appointment from '../models/Appointments';
import Notification from '../schemas/Notification';



class AppointmentController {
    async index(req, res) {
        const { page = 1 } = req.query;

        const appointments = await Appointment.findAll({
            where: { user_id: req.userId, canceled_at: null },
            order: ['date'],
            attributes: ['id', 'date'],
            limit: 20,
            offset: (page - 1) * 20,
            include: [{
                model: User,
                as: 'provider',
                attributes: ['id', 'name'],
                include: [{
                    model: File,
                    as: 'avatar',
                    attributes: ['id', 'path', 'url'],
                }, ],
            }, ],
        });
        return res.json(appointments);
    }

    async store(req, res) {
        const schema = Yup.object().shape({
            provider_id: Yup.number().required(),
            date: Yup.date().required(),
        });

        if (!(await schema.isValid(req.body))) {
            return res.status(400).json({ error: 'Erro de Validação' });
        }

        const { provider_id, date } = req.body;

        // Checar se o provider_id é um provider
        const checkIsProvider = await User.findOne({
            where: { id: provider_id, provider: true },
        });

        if (!checkIsProvider) {
            return res.status(401).json({
                // eslint-disable-next-line prettier/prettier
                error: 'Você só pode agendar um horário com um prestador de serviços',
            });
        }

        const hourStart = startOfHour(parseISO(date));

        // Verificação de data passada

        if (isBefore(hourStart, new Date())) {
            return res
                .status(400)
                .json({ error: 'Datas já passadas não são permitidas' });
        }
        // Verificação da disponibilidade de data

        const checkAvailability = await Appointment.findOne({
            where: {
                provider_id,
                canceled_at: null,
                date: hourStart,
            },
        });

        if (checkAvailability) {
            return res.status(400).json({ error: 'Data não disponível' });
        }

        // Criar agendamento
        const appointment = await Appointment.create({
            user_id: req.userId,
            provider_id,
            date: hourStart,
        });
        // Notificação de agendamento para o prestador
        const user = await User.findByPk(req.userId);
        const formattedDate = format(
            hourStart,
            "'d' dd 'de' MMMM', às 'H:mm'h'", { locale: pt }
        );

        await Notification.create({
            content: `Novo agendamento de ${user.name} para o dia ${formattedDate}`,
            user: provider_id,
        });

        return res.json(appointment);
    }
}

export default new AppointmentController();