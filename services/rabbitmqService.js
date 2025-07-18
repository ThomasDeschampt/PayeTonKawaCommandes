const amqp = require('amqplib');
require('dotenv').config();
const { messagesSent, messagesReceived } = require('../metrics');
const CommandeService = require('./CommandeService');

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://admin:admin@localhost:4001';
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

class RabbitMQService {
    constructor() {
        this.connection = null;
        this.channel = null;
        this.queues = {
            productCreated: 'product.created',
            productUpdated: 'product.updated',
            productDeleted: 'product.deleted',
            stockUpdated: 'product.stock.updated',
            orderCreated: 'order.created',
            orderUpdated: 'order.updated',
            orderDeleted: 'order.deleted',
            orderStatusChanged: 'order.status.changed',
            clientCreated: 'client.created',
            clientUpdated: 'client.updated',
            clientDeleted: 'client.deleted'
        };
        this.isConnecting = false;
        console.log('Service RabbitMQ initialisé avec URL:', RABBITMQ_URL);
    }

    async connect() {
        if (this.isConnecting) {
            console.log('Connexion déjà en cours...');
            return;
        }

        this.isConnecting = true;
        let retries = 0;

        while (retries < MAX_RETRIES) {
            try {
                console.log(`Tentative de connexion à RabbitMQ (${retries + 1}/${MAX_RETRIES})...`);
                this.connection = await amqp.connect(RABBITMQ_URL);
                this.channel = await this.connection.createChannel();

                // Déclaration des queues
                for (const queue of Object.values(this.queues)) {
                    await this.channel.assertQueue(queue, { durable: true });
                }

                // Gestion des événements de connexion
                this.connection.on('error', (err) => {
                    console.error('Erreur de connexion RabbitMQ:', err);
                    this.reconnect();
                });

                this.connection.on('close', () => {
                    console.log('Connexion RabbitMQ fermée');
                    this.reconnect();
                });

                console.log('Connecté à RabbitMQ avec succès');
                this.isConnecting = false;
                return;
            } catch (error) {
                retries++;
                console.error(`Échec de la connexion (tentative ${retries}/${MAX_RETRIES}):`, error.message);
                
                if (retries === MAX_RETRIES) {
                    console.error('Impossible de se connecter à RabbitMQ après plusieurs tentatives');
                    this.isConnecting = false;
                    throw error;
                }
                
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
            }
        }
    }

    async reconnect() {
        if (!this.isConnecting) {
            console.log('Tentative de reconnexion à RabbitMQ...');
            await this.connect();
        }
    }

    async consumeMessages() {
        try {
            // Consommation des messages produits
            await this.channel.consume(this.queues.productCreated, async (msg) => {
                if (msg !== null) {
                    try {
                        const content = JSON.parse(msg.content.toString());
                        console.log('Received product created message:', content);
                        messagesSent.inc({ queue: 'product.created' });
                        this.channel.ack(msg);
                    } catch (error) {
                        console.error('Error processing product created message:', error);
                        this.channel.nack(msg, false, false);
                    }
                }
            });

            await this.channel.consume(this.queues.productUpdated, async (msg) => {
                if (msg !== null) {
                    try {
                        const content = JSON.parse(msg.content.toString());
                        console.log('Received product updated message:', content);
                        messagesSent.inc({ queue: 'product.updated' });
                        this.channel.ack(msg);
                    } catch (error) {
                        console.error('Error processing product updated message:', error);
                        this.channel.nack(msg, false, false);
                    }
                }
            });

            await this.channel.consume(this.queues.productDeleted, async (msg) => {
                if (msg !== null) {
                    try {
                        const content = JSON.parse(msg.content.toString());
                        console.log('Received product deleted message:', content);
                        messagesSent.inc({ queue: 'product.deleted' });
                        this.channel.ack(msg);
                    } catch (error) {
                        console.error('Error processing product deleted message:', error);
                        this.channel.nack(msg, false, false);
                    }
                }
            });

            // Consommation des messages commandes
            // await this.channel.consume(this.queues.orderCreated, async (msg) => {
            //     if (msg !== null) {
            //         try {
            //             const content = JSON.parse(msg.content.toString());
            //             console.log('Received order created message:', content);
            //             messagesReceived.inc({ queue: 'order.created' });
            //             this.channel.ack(msg);
            //         } catch (error) {
            //             console.error('Error processing order created message:', error);
            //             this.channel.nack(msg, false, false);
            //         }
            //     }
            // });

            await this.channel.consume(this.queues.orderUpdated, async (msg) => {
                if (msg !== null) {
                    try {
                        const content = JSON.parse(msg.content.toString());
                        console.log('Received order updated message:', content);
                        messagesSent.inc({ queue: 'order.updated' });
                        this.channel.ack(msg);
                    } catch (error) {
                        console.error('Error processing order updated message:', error);
                        this.channel.nack(msg, false, false);
                    }
                }
            });

            await this.channel.consume(this.queues.orderDeleted, async (msg) => {
                if (msg !== null) {
                    try {
                        const content = JSON.parse(msg.content.toString());
                        console.log('Received order deleted message:', content);
                        messagesSent.inc({ queue: 'order.deleted' });
                        this.channel.ack(msg);
                    } catch (error) {
                        console.error('Error processing order deleted message:', error);
                        this.channel.nack(msg, false, false);
                    }
                }
            });

            await this.channel.consume(this.queues.orderStatusChanged, async (msg) => {
                if (msg !== null) {
                    try {
                        const content = JSON.parse(msg.content.toString());
                        console.log('Received order status changed message:', content);
                        messagesSent.inc({ queue: 'order.status.changed' });
                        this.channel.ack(msg);
                        if (content.statut === 'validée') {
                            await CommandeService.updateCommande(content.id, { statut: 'validée' });
                            console.log(`Commande ${content.id} mise à jour avec statut validée`);
                        }
                    } catch (error) {
                        console.error('Error processing order status changed message:', error);
                        this.channel.nack(msg, false, false);
                    }
                }
            });

            // Consommation des messages clients
            await this.channel.consume(this.queues.clientCreated, async (msg) => {
                if (msg !== null) {
                    try {
                        const content = JSON.parse(msg.content.toString());
                        console.log('Received client created message:', content);
                        messagesSent.inc({ queue: 'client.created' });
                        this.channel.ack(msg);
                    } catch (error) {
                        console.error('Error processing client created message:', error);
                        this.channel.nack(msg, false, false);
                    }
                }
            });

            await this.channel.consume(this.queues.clientUpdated, async (msg) => {
                if (msg !== null) {
                    try {
                        const content = JSON.parse(msg.content.toString());
                        console.log('Received client updated message:', content);
                        messagesSent.inc({ queue: 'client.updated' });
                        this.channel.ack(msg);
                    } catch (error) {
                        console.error('Error processing client updated message:', error);
                        this.channel.nack(msg, false, false);
                    }
                }
            });

            await this.channel.consume(this.queues.clientDeleted, async (msg) => {
                if (msg !== null) {
                    try {
                        const content = JSON.parse(msg.content.toString());
                        console.log('Received client deleted message:', content);
                        messagesSent.inc({ queue: 'client.deleted' });
                        this.channel.ack(msg);
                    } catch (error) {
                        console.error('Error processing client deleted message:', error);
                        this.channel.nack(msg, false, false);
                    }
                }
            });

            console.log('Started consuming messages from all queues');
        } catch (error) {
            console.error('Error starting message consumption:', error);
            throw error;
        }
    }

    async publishOrderCreated(orderData) {
        try {
            await this.channel.sendToQueue(
                this.queues.orderCreated,
                Buffer.from(JSON.stringify(orderData)),
                { persistent: true }
            );
        } catch (error) {
            console.error('Error publishing order created message:', error);
            throw error;
        }
    }

    async publishOrderUpdated(orderData) {
        try {
            await this.channel.sendToQueue(
                this.queues.orderUpdated,
                Buffer.from(JSON.stringify(orderData)),
                { persistent: true }
            );
        } catch (error) {
            console.error('Error publishing order updated message:', error);
            throw error;
        }
    }

    async publishOrderDeleted(orderId) {
        try {
            await this.channel.sendToQueue(
                this.queues.orderDeleted,
                Buffer.from(JSON.stringify({ id: orderId })),
                { persistent: true }
            );
        } catch (error) {
            console.error('Error publishing order deleted message:', error);
            throw error;
        }
    }

    async publishOrderStatusChanged(orderData) {
        try {
            await this.channel.sendToQueue(
                this.queues.orderStatusChanged,
                Buffer.from(JSON.stringify(orderData)),
                { persistent: true }
            );
        } catch (error) {
            console.error('Error publishing order status changed message:', error);
            throw error;
        }
    }
}

module.exports = new RabbitMQService(); 